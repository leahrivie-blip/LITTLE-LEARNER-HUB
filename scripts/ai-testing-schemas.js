/**
 * Phase 23 — AI Testing structured-output JSON schemas.
 *
 * Every workflow has its OWN schema (never one shared "do anything" schema —
 * this is intentional per the safety requirements: a shared prompt/schema
 * makes it too easy to silently change every workflow at once). Schemas
 * follow OpenAI Structured Outputs "strict" mode conventions: every object
 * sets additionalProperties:false and lists every property in "required"
 * (nullable fields use a ["type","null"] union instead of being optional).
 */

const CLASSROOM_ASSISTANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordTypes", "childrenIdentified", "groupEntry", "individualExceptions", "missingInformationWarnings", "safetyWarnings", "summary"],
  properties: {
    recordTypes: {
      type: "array",
      items: {
        type: "string",
        enum: ["attendance", "meal", "nap", "diaper", "potty", "activity", "loose_parts_play", "observation", "daily_summary", "medication", "injury_incident"],
      },
    },
    childrenIdentified: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role"],
        properties: {
          name: { type: "string" },
          role: { type: "string", enum: ["group", "exception"] },
        },
      },
    },
    groupEntry: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["recordType", "description", "time"],
          properties: {
            recordType: { type: "string" },
            description: { type: "string" },
            time: { type: "string" },
          },
        },
      ],
    },
    individualExceptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["childName", "description"],
        properties: {
          childName: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    missingInformationWarnings: {
      type: "array",
      items: { type: "string" },
    },
    safetyWarnings: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
  },
};

const PROFESSIONAL_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draftType", "subject", "body", "tone", "missingInformationWarnings"],
  properties: {
    draftType: {
      type: "string",
      enum: ["parent_message", "incident_report", "behavior_note", "observation", "developmental_note", "next_steps", "daily_report", "general_documentation"],
    },
    subject: { type: "string" },
    body: { type: "string" },
    tone: {
      type: "string",
      enum: ["calm_factual_professional"],
    },
    missingInformationWarnings: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const LESSON_PLAN_ASSIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["organizedActivities", "ageGroupSuggestions", "playBasedAlternatives", "looseSummaryOfSourceText", "missingFields"],
  properties: {
    organizedActivities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "title", "materials", "developmentalFocus"],
        properties: {
          day: { type: "string" },
          title: { type: "string" },
          materials: { type: "array", items: { type: "string" } },
          developmentalFocus: { type: "array", items: { type: "string" } },
        },
      },
    },
    ageGroupSuggestions: {
      type: "array",
      items: { type: "string", enum: ["infant", "toddler", "preschool", "school_age"] },
    },
    playBasedAlternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["originalActivity", "alternative", "looseParts"],
        properties: {
          originalActivity: { type: "string" },
          alternative: { type: "string" },
          looseParts: { type: "array", items: { type: "string" } },
        },
      },
    },
    looseSummaryOfSourceText: { type: "string" },
    missingFields: { type: "array", items: { type: "string" } },
  },
};

const FORM_BUILDER_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "category", "sections", "reviewDisclaimer"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: {
      type: "string",
      enum: ["health_medication", "media_permission", "field_trip", "enrollment", "emergency_contacts", "policy_acknowledgment", "general"],
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "fields"],
        properties: {
          title: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "fieldType", "required"],
              properties: {
                label: { type: "string" },
                fieldType: { type: "string", enum: ["short_text", "long_text", "checkbox", "date", "signature", "select"] },
                required: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    reviewDisclaimer: { type: "string" },
  },
};

const SCHEMAS_BY_WORKFLOW = Object.freeze({
  classroom_assistant: { name: "classroom_assistant_entry_v1", schema: CLASSROOM_ASSISTANT_SCHEMA },
  professional_draft: { name: "professional_draft_v1", schema: PROFESSIONAL_DRAFT_SCHEMA },
  lesson_plan_assist: { name: "lesson_plan_assist_v1", schema: LESSON_PLAN_ASSIST_SCHEMA },
  form_builder: { name: "form_builder_draft_v1", schema: FORM_BUILDER_DRAFT_SCHEMA },
});

module.exports = {
  CLASSROOM_ASSISTANT_SCHEMA,
  PROFESSIONAL_DRAFT_SCHEMA,
  LESSON_PLAN_ASSIST_SCHEMA,
  FORM_BUILDER_DRAFT_SCHEMA,
  SCHEMAS_BY_WORKFLOW,
};
