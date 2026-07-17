(() => {
  const plans = [
    {
      id: "pirates",
      title: "Pirate Adventure",
      age: "Preschool",
      activities: 12,
      badge: "FREE",
      favorite: true,
      cover: "covers/cover-pirates.jpg",
      current: "/images/lesson-covers/pirates.svg",
    },
    {
      id: "construction",
      title: "Construction Crew",
      age: "Toddler",
      activities: 10,
      badge: "PRO",
      favorite: false,
      cover: "covers/cover-construction.jpg",
      current: "/images/lesson-covers/building.svg",
    },
    {
      id: "farm",
      title: "Farm Friends",
      age: "Toddler",
      activities: 11,
      badge: "FREE",
      favorite: false,
      cover: "covers/cover-farm.jpg",
      current: "/images/lesson-covers/farm.svg",
    },
    {
      id: "dinosaurs",
      title: "Dinosaur Discovery",
      age: "Preschool",
      activities: 14,
      badge: "PRO",
      favorite: true,
      cover: "covers/cover-dinosaurs.jpg",
      current: "/images/lesson-covers/dinosaurs.svg",
    },
    {
      id: "ocean",
      title: "Ocean Adventure",
      age: "Preschool",
      activities: 13,
      badge: "FREE",
      favorite: false,
      cover: "covers/cover-ocean.jpg",
      current: "/images/lesson-covers/ocean.svg",
    },
    {
      id: "bugs",
      title: "Bugs & Butterflies",
      age: "Toddler",
      activities: 9,
      badge: "PRO",
      favorite: false,
      cover: "covers/cover-bugs.jpg",
      current: "/images/lesson-covers/insects.svg",
    },
    {
      id: "world",
      title: "Around the World",
      age: "Preschool",
      activities: 12,
      badge: "FREE",
      favorite: true,
      cover: "covers/cover-world.jpg",
      current: "/images/lesson-covers/around-the-world.svg",
    },
    {
      id: "space",
      title: "Space Explorers",
      age: "Preschool",
      activities: 15,
      badge: "PRO",
      favorite: false,
      cover: "covers/cover-space.jpg",
      current: "/images/lesson-covers/space.svg",
    },
  ];

  function cardHtml(plan) {
    const badgeClass = plan.badge === "PRO" ? "is-pro" : "is-free";
    const savedClass = plan.favorite ? "is-saved" : "";
    const star = plan.favorite ? "★" : "☆";
    return `
      <article class="browse-card netflix-cover-card" data-plan="${plan.id}">
        <div class="browse-card-cover">
          <img src="${plan.cover}" alt="Cover for ${plan.title}" width="480" height="270" loading="eager" decoding="async" />
          <span class="browse-card-badge ${badgeClass}">${plan.badge}</span>
          <button class="browse-card-save ${savedClass}" type="button" aria-label="Favorite" tabindex="-1">${star}</button>
          <div class="browse-card-cover-overlay">
            <span class="browse-card-age">${plan.age}</span>
            <h3 class="browse-card-title-overlay">${plan.title}</h3>
            <p class="browse-card-activity-count">${plan.activities} Activities</p>
          </div>
        </div>
        <div class="browse-card-actions">
          <button class="browse-use-plan" type="button" tabindex="-1">Use This Plan</button>
        </div>
      </article>
    `;
  }

  function compareHtml(plan) {
    return `
      <article class="compare-pair">
        <h3>${plan.title}</h3>
        <div class="compare-cols">
          <div class="compare-col">
            <span>Current</span>
            <img src="${plan.current}" alt="Current ${plan.title} cover" width="320" height="180" loading="eager" />
          </div>
          <div class="compare-col">
            <span>Proposed</span>
            <img src="${plan.cover}" alt="Proposed ${plan.title} cover" width="320" height="180" loading="eager" />
          </div>
        </div>
      </article>
    `;
  }

  const proposed = document.getElementById("proposedRow");
  const mobile = document.getElementById("mobileRow");
  const compare = document.getElementById("compareGrid");

  if (proposed) proposed.innerHTML = plans.map(cardHtml).join("");
  if (mobile) mobile.innerHTML = plans.slice(0, 3).map(cardHtml).join("");
  if (compare) compare.innerHTML = plans.map(compareHtml).join("");
})();
