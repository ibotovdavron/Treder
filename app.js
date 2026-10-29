(() => {
  "use strict";

  const D = window.CENTER_DATA || {};

  // Pastki menyu
  const pages = [
    ["index.html", "🏠", "Bosh sahifa"],
    ["competitions.html", "🏆", "Musobaqalar"],
    ["teachers.html", "🎓", "Ustozlar"],
    ["ranking.html", "📊", "Reyting"],
    ["bilmasvoy.html", "🎮", "Bilmasvoy"],
    ["schedule.html", "🗓️", "Jadval"],
    ["shop.html", "🛍️", "Do‘kon"],
    ["about.html", "❓", "Kunlik savol"],
    ["contact.html", "☎️", "Aloqa"]
  ];

  const path =
    location.pathname.split("/").pop() || "index.html";

  const nav = document.getElementById("bottomNav");

  if (nav) {
    nav.innerHTML = pages.map(([url, icon, label]) => `
      <a
        class="navitem ${path === url ? "active" : ""}"
        href="${url}"
        aria-label="${label}"
      >
        <span class="navicon">${icon}</span>
        <span class="navlabel">${label}</span>
      </a>
    `).join("");
  }

  // Xavfsiz matn chiqarish
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  // Markaz haqidagi ma'lumotlar
  document.querySelectorAll("[data-center]").forEach((el) => {
    const key = el.dataset.center;

    if (D[key] !== undefined) {
      el.textContent = D[key];
    }
  });

  // Bosh sahifadagi fanlar
  const subjects = document.getElementById("homeSubjects");

  if (subjects) {
    subjects.innerHTML = (D.subjects || []).map((s) => `
      <div class="subject">
        <span class="emoji">${esc(s.icon)}</span>
        <div>
          <b>${esc(s.name)}</b>
          <small>${esc(s.caption)}</small>
        </div>
      </div>
    `).join("");
  }

  // Bosh sahifa kartalari
  // Natijalar o'rniga Bilmasvoy
  const features = [
    [
      "competitions.html",
      "🏆",
      "Musobaqalar",
      "Bilimdonlar bellashuvi"
    ],
    [
      "ranking.html",
      "📊",
      "Reyting",
      "O‘quvchilar natijalari"
    ],
    [
      "teachers.html",
      "🧑‍🏫",
      "Ustozlar",
      "Tajribali va malakali"
    ],
    [
      "bilmasvoy.html",
      "🎮",
      "Bilmasvoy",
      "Bilimlar sarguzashti"
    ],
    [
      "schedule.html",
      "🗓️",
      "Dars jadvali",
      "Darslar va guruhlar"
    ],
    [
      "shop.html",
      "🛍️",
      "Do‘kon",
      "Kitob, daftar va o‘quv qurollari"
    ]
  ];

  const homeFeatures = document.getElementById("homeFeatures");

  if (homeFeatures) {
    homeFeatures.innerHTML = features.map(
      ([href, icon, title, desc]) => `
        <a class="card" href="${href}">
          <div class="card-visual">${icon}</div>
          <div class="card-body">
            <h3>${title}</h3>
            <p>${desc}</p>
            <span class="green">Ochish →</span>
          </div>
        </a>
      `
    ).join("");
  }

  // Reyting uchun o'quvchilarni saralash
  const getSortedStudents = () =>
    (D.students || []).slice().sort(
      (a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0)
    );

  // Bosh sahifadagi TOP 5
  const rankPreview = document.getElementById("rankPreview");

  if (rankPreview) {
    rankPreview.innerHTML = getSortedStudents()
      .slice(0, 5)
      .map((s, i) => `
        <div class="result-row">
          <div>
            <b>
              <span class="ranknum">${i + 1}.</span>
              ${esc(s.name)}
            </b>
            <div class="smallprint">${esc(s.group)}</div>
          </div>
          <strong class="stars">
            ⭐ ${Number(s.stars) || 0}
          </strong>
        </div>
      `).join("");
  }

  // Musobaqalar
  const comps = document.getElementById("competitionGrid");

  if (comps) {
    comps.innerHTML = (D.competitions || []).map((c) => `
      <article class="competition-card">
        <div class="avatar">${esc(c.icon)}</div>
        <span class="tag">${esc(c.status)}</span>
        <h3>${esc(c.name)}</h3>
        <b>${esc(c.type)}</b>
        <p class="muted">${esc(c.description)}</p>
      </article>
    `).join("");
  }

  // Ustozlar
  const teachers = document.getElementById("teacherGrid");

  if (teachers) {
    teachers.innerHTML = (D.teachers || []).map((t) => `
      <article class="teacher-card">
        <div class="avatar">${esc(t.icon || "🎓")}</div>
        <span class="tag">${esc(t.subject)}</span>
        <h3>${esc(t.name)}</h3>
        <p class="muted">${esc(t.bio)}</p>
      </article>
    `).join("");
  }

  // To'liq reyting jadvali
  const ranking = document.getElementById("rankingRows");

  if (ranking) {
    ranking.innerHTML = getSortedStudents().map((s, i) => `
      <tr>
        <td class="ranknum">${i + 1}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.group)}</td>
        <td class="stars">⭐ ${Number(s.stars) || 0}</td>
        <td>${esc(s.result)}</td>
      </tr>
    `).join("");
  }

  // Natijalar ro'yxati (agar alohida sahifada ishlatilsa)
  const results = document.getElementById("resultsList");

  if (results) {
    results.innerHTML = getSortedStudents().map((s) => `
      <div class="result-row">
        <div>
          <b>${esc(s.name)}</b>
          <div class="smallprint">
            ${esc(s.group)} · ${esc(s.result)}
          </div>
        </div>
        <strong class="stars">
          ⭐ ${Number(s.stars) || 0}
        </strong>
      </div>
    `).join("");
  }

  // Yulduz berish qoidalari
  const rules = document.getElementById("starRules");

  if (rules) {
    rules.innerHTML = (D.starRules || []).map((r) => `
      <div class="result-row">
        <span>${esc(r.title)}</span>
        <b class="stars">+${Number(r.stars) || 0} ⭐</b>
      </div>
    `).join("");
  }

  // O'quvchilarni qidirish
  const search = document.getElementById("studentSearch");

  if (search && ranking) {
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase().trim();

      ranking.querySelectorAll("tr").forEach((row) => {
        row.classList.toggle(
          "hidden",
          !row.textContent.toLowerCase().includes(q)
        );
      });
    });
  }

  // Musobaqalarni qidirish
  const compSearch = document.getElementById("competitionSearch");

  if (compSearch && comps) {
    compSearch.addEventListener("input", () => {
      const q = compSearch.value.toLowerCase().trim();

      [...comps.children].forEach((card) => {
        card.classList.toggle(
          "hidden",
          !card.textContent.toLowerCase().includes(q)
        );
      });
    });
  }

  // Ustozlarni qidirish
  const teacherSearch = document.getElementById("teacherSearch");

  if (teacherSearch && teachers) {
    teacherSearch.addEventListener("input", () => {
      const q = teacherSearch.value.toLowerCase().trim();

      [...teachers.children].forEach((card) => {
        card.classList.toggle(
          "hidden",
          !card.textContent.toLowerCase().includes(q)
        );
      });
    });
  }

  // Telefon raqami
  document.querySelectorAll("[data-phone]").forEach((el) => {
    el.href = "tel:" + String(D.phone || "").replace(/\s/g, "");
  });

  // Telegram
  document.querySelectorAll("[data-telegram]").forEach((el) => {
    el.href =
      D.telegram || "https://t.me/sufi_ollohyor_uquv_markaz";
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

  // Instagram
  document.querySelectorAll("[data-instagram]").forEach((el) => {
    el.href =
      D.instagram || "https://www.instagram.com/sufiollohyor/";
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

  // Matematika Telegram kanali
  document.querySelectorAll("[data-math-telegram]").forEach((el) => {
    el.href =
      D.mathTelegram || "https://t.me/matematika144";
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

})();
