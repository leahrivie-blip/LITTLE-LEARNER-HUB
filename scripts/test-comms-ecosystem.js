#!/usr/bin/env node
/**
 * Communication ecosystem smoke tests: drafts, message center, templates,
 * tags, timeline, health, feature statuses, broadcast logging.
 * Run: node scripts/test-comms-ecosystem.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");
const commsLib = require("../server/comms-lib.js");

const PORT = 4335;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.comms-ecosystem-test-${process.pid}.json`);
const ADMIN_EMAIL = "leah@littlelearnerhub.com";
const FREE_USER = "comms-free@example.com";

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [FREE_USER]: {
      email: FREE_USER,
      firstName: "Comms",
      lastName: "Free",
      plan: "Free",
      signupAt: "2026-01-10T12:00:00.000Z",
      lastSeenAt: "2026-07-14T12:00:00.000Z",
      accountType: "home_daycare",
    },
    "quiet@example.com": {
      email: "quiet@example.com",
      plan: "Free",
      lastSeenAt: "2025-01-01T12:00:00.000Z",
    },
  });
  const { child, getLog } = startServer({ port: PORT, storeFile: STORE });

  try {
    await waitForHealth(BASE);
    const login = await request(BASE, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200);
    const adminToken = login.json.token;

    await test("comms-lib feature status aliases normalize correctly", async () => {
      assert.equal(commsLib.normalizeFeatureStatus("In Development"), "In Progress");
      assert.equal(commsLib.normalizeFeatureStatus("Released"), "Completed");
      assert.equal(commsLib.normalizeFeatureStatus("Planned"), "Planned");
    });

    await test("Universal drafts save and restore for a member", async () => {
      const save = await request(BASE, "POST", "/api/drafts", {
        email: FREE_USER,
        body: {
          scope: "support",
          formId: "contact-support",
          payload: { fields: { message: "Draft support text", topic: "Billing Questions" } },
        },
      });
      assert.equal(save.status, 200, JSON.stringify(save.json));
      const list = await request(BASE, "GET", "/api/drafts?scope=support&formId=contact-support", {
        email: FREE_USER,
      });
      assert.equal(list.status, 200);
      assert.ok(list.json.drafts?.length >= 1);
      assert.match(JSON.stringify(list.json.drafts[0].payload), /Draft support text/);
    });

    await test("Message center returns sent/inbox/support buckets", async () => {
      await request(BASE, "POST", "/api/messages/reply", {
        email: FREE_USER,
        body: { body: "Hello from message center test" },
      });
      await request(BASE, "POST", "/api/support-ticket", {
        body: {
          kind: "Support Request",
          name: "Comms Free",
          email: FREE_USER,
          topic: "General Questions",
          message: "Need help with calendar",
        },
      });
      const center = await request(BASE, "GET", "/api/messages/center", { email: FREE_USER });
      assert.equal(center.status, 200, JSON.stringify(center.json));
      assert.ok(center.json.sent?.length >= 1);
      assert.ok(center.json.conversation?.length >= 1);
      assert.ok(center.json.supportRequests?.length >= 1);
      assert.ok(typeof center.json.unreadCount === "number");
    });

    await test("Admin templates merge defaults and accept custom saves", async () => {
      const list = await request(BASE, "GET", `/api/admin/message-templates?adminToken=${adminToken}`);
      assert.equal(list.status, 200);
      assert.ok(list.json.templates.length >= 9);
      const save = await request(BASE, "POST", "/api/admin/message-templates", {
        body: {
          adminToken,
          template: {
            id: "custom-hello",
            label: "Custom Hello",
            subject: "Hello custom",
            body: "Custom body",
          },
        },
      });
      assert.equal(save.status, 200, JSON.stringify(save.json));
      assert.ok(save.json.templates.some((t) => t.id === "custom-hello"));
    });

    await test("User tags + timeline are searchable for admin", async () => {
      const tags = await request(BASE, "POST", "/api/admin/user-tags", {
        body: { adminToken, email: FREE_USER, tags: ["Free User", "Needs Follow-Up", "Home Daycare"] },
      });
      assert.equal(tags.status, 200, JSON.stringify(tags.json));
      const get = await request(BASE, "GET", `/api/admin/user-tags?adminToken=${adminToken}&email=${encodeURIComponent(FREE_USER)}`);
      assert.ok(get.json.tags.includes("Needs Follow-Up"));
      const timeline = await request(
        BASE,
        "GET",
        `/api/admin/user-timeline?adminToken=${adminToken}&userEmail=${encodeURIComponent(FREE_USER)}`,
      );
      assert.equal(timeline.status, 200, JSON.stringify(timeline.json));
      assert.ok((timeline.json.timeline || timeline.json.events || []).length >= 1);
    });

    await test("User health dashboard buckets active vs inactive", async () => {
      const health = await request(BASE, "GET", `/api/admin/user-health?adminToken=${adminToken}`);
      assert.equal(health.status, 200, JSON.stringify(health.json));
      assert.ok(health.json.summary);
      assert.ok(Array.isArray(health.json.active));
      assert.ok(Array.isArray(health.json.inactive) || Array.isArray(health.json.at_risk));
      const quiet = [...(health.json.inactive || []), ...(health.json.at_risk || [])]
        .find((u) => u.email === "quiet@example.com");
      assert.ok(quiet, "quiet user should not be in active bucket");
      const free = [...(health.json.active || []), ...(health.json.at_risk || []), ...(health.json.inactive || [])]
        .find((u) => u.email === FREE_USER);
      assert.ok(free, "free user should appear in health rows");
      assert.equal(free.accessPlan, "Free");
      assert.ok(free.accountType, "accountType should be enriched");
      assert.ok(free.createdAt, "createdAt should be enriched");
      assert.ok("lastActivityAt" in free, "lastActivityAt should be present");
      assert.ok(Number.isFinite(Number(free.daysSince)), "daysSince should be numeric");
    });

    await test("Admin inbox aggregates new submissions and unread DMs", async () => {
      const bug = await request(BASE, "POST", "/api/bug-report", {
        body: {
          email: FREE_USER,
          name: "Comms Free",
          title: "Calendar blank on mobile",
          description: "Week view renders empty on iPhone Safari",
          category: "Calendar",
        },
      });
      assert.equal(bug.status, 200, JSON.stringify(bug.json));

      const feature = await request(BASE, "POST", "/api/feature-request", {
        body: {
          email: FREE_USER,
          name: "Comms Free",
          title: "Bulk export observations",
          description: "Export a month of observations as PDF",
        },
      });
      assert.equal(feature.status, 200, JSON.stringify(feature.json));

      // Member reply creates an unread admin notification for the conversation.
      const seedMsg = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: FREE_USER,
          subject: "Quick check-in",
          body: "How is the calendar looking this week?",
          confirm: true,
          deliverVia: "in_app",
        },
      });
      assert.equal(seedMsg.status, 200, JSON.stringify(seedMsg.json));
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: FREE_USER,
        body: { body: "Still blank on mobile — filing a bug too." },
      });
      assert.equal(reply.status, 200, JSON.stringify(reply.json));

      const inbox = await request(BASE, "GET", `/api/admin/inbox?adminToken=${adminToken}`);
      assert.equal(inbox.status, 200, JSON.stringify(inbox.json));
      assert.ok(Array.isArray(inbox.json.items));
      assert.ok(inbox.json.summary);
      assert.ok(inbox.json.items.some((i) => i.kind === "bug" && /Calendar blank/i.test(i.title)));
      assert.ok(inbox.json.items.some((i) => i.kind === "feature" && /Bulk export/i.test(i.title)));
      assert.ok(inbox.json.items.some((i) => i.kind === "message" && i.email === FREE_USER));
    });

    await test("Feature request statuses align to product vocabulary", async () => {
      const create = await request(BASE, "POST", "/api/feature-request", {
        body: {
          email: FREE_USER,
          name: "Comms Free",
          title: "Bulk print week",
          description: "Print the whole week in one click",
        },
      });
      assert.equal(create.status, 200);
      const id = create.json.featureRequest.id;
      const update = await request(BASE, "POST", "/api/admin/feature-request-update", {
        body: { adminToken, id, status: "In Development" },
      });
      assert.equal(update.status, 200, JSON.stringify(update.json));
      assert.equal(update.json.featureRequest.status, "In Progress");
    });

    await test("Group preview works and broadcast log records confirmed sends only", async () => {
      const preview = await request(BASE, "POST", "/api/admin/messages/preview", {
        body: { adminToken, audience: "free", body: "Preview only — do not send to production." },
      });
      assert.equal(preview.status, 200);
      assert.ok(preview.json.recipientCount >= 1);

      const blocked = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "free",
          body: "Should not send without confirm",
          confirm: false,
          deliverVia: "in_app",
        },
      });
      assert.equal(blocked.status, 400);

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "selected",
          selectedEmails: [FREE_USER],
          subject: "Selected smoke",
          body: "Logged broadcast to one selected Free user only.",
          confirm: true,
          deliverVia: "in_app",
          kind: "announcement",
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      assert.equal(send.json.recipientCount, 1);
      const log = await request(BASE, "GET", `/api/admin/broadcast-log?adminToken=${adminToken}`);
      assert.equal(log.status, 200);
      // selected audience is not private — should log
      assert.ok(log.json.broadcasts.some((b) => b.messageId === send.json.message.id));
    });

    await test("Automations endpoint returns editable trial/founding sequences", async () => {
      const list = await request(BASE, "GET", `/api/admin/automations?adminToken=${adminToken}`);
      assert.equal(list.status, 200);
      assert.ok(list.json.automations.some((a) => a.id === "trial-sequence"));
      assert.ok(list.json.automations.some((a) => a.id === "founding-sequence"));
    });

    await test("Release notes support lesson/activity addition categories", async () => {
      const create = await request(BASE, "POST", "/api/admin/release-notes", {
        body: {
          adminToken,
          version: "2026.7.16",
          releaseDate: "2026-07-16",
          status: "published",
          featuresAdded: ["My Messages & Requests"],
          improvements: ["Draft auto-save"],
          bugsFixed: ["Unread badge sync"],
          lessonPlanAdditions: ["Toddler Color Hunt"],
          activityAdditions: ["Sensory bottles"],
        },
      });
      assert.equal(create.status, 200, JSON.stringify(create.json));
      const pub = await request(BASE, "GET", "/api/release-notes");
      assert.ok(pub.json.releaseNotes.some((n) => (n.lessonPlanAdditions || []).includes("Toddler Color Hunt")));
    });

    if (process.exitCode) {
      console.error("\nBoot log:\n" + getLog());
    } else {
      console.log("\n✅ Communication ecosystem tests passed.");
    }
  } finally {
    child.kill();
    try { require("node:fs").unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
