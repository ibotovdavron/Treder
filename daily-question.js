/* SO‘FI OLLOHYOR — KUNLIK SAVOL
   Bir savol uchun bitta g‘olib.
   Muhim: haqiqiy yulduzlar uchun Supabase
   orqali server tomonda tekshiruv zarur.
*/

(function () {
  "use strict";

  const CONFIG = {
    starsForWinner: 2,
    telegram: "https://t.me/sufi_ollohyor_uquv_markaz"
  };

  // Saytda o‘quvchilar ro‘yxati mavjud bo‘lsa,
  // CENTER_DATA.students dan foydalanadi.
  function getStudents() {
    const data = window.CENTER_DATA || {};
    const students = data.students;

    if (Array.isArray(students)) {
      return students.map(function (student) {
        return typeof student === "string"
          ? { name: student, group: "" }
          : {
              name: student.name || student.full_name || "",
              group: student.group || student.class || ""
            };
      }).filter(function (student) {
        return student.name;
      });
    }

    return [];
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }

  function createSection() {
    if (document.getElementById("dailyQuestionSection")) return;

    const section = document.createElement("section");
    section.id = "dailyQuestionSection";
    section.className = "panel daily-question";

    section.innerHTML = `
      <div class="daily-head">
        <span class="eyebrow">🧠 BILIMINGIZNI SINANG</span>
        <h2>Kunlik <span>savol</span></h2>
        <p class="daily-muted">
          Birinchi bo‘lib to‘g‘ri javob toping va 2 yulduz yuting!
        </p>
      </div>

      <div class="daily-card">
        <div class="daily-icon">❓</div>
        <div id="dailyQuestionText">Savol yuklanmoqda...</div>
        <div id="dailyOptions" class="daily-options"></div>

        <button type="button" id="dailyCheck" class="btn">
          Javobni tekshirish
        </button>

        <div id="dailyFeedback" class="daily-feedback"
             aria-live="polite"></div>

        <div id="dailyWinner" class="daily-winner"
             aria-live="polite"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .daily-question {
        margin: 24px 0;
        padding: 22px;
        border: 1px solid rgba(0,255,128,.25);
        border-radius: 24px;
        background: linear-gradient(145deg,#082218,#020b09);
        color: #f4fff8;
      }
      .daily-head h2 { font-size: 30px; margin: 12px 0; }
      .daily-head h2 span { color: #32e98a; }
      .daily-muted { color: #b3c9bc; line-height: 1.6; }
      .daily-card {
        margin-top: 20px; padding: 18px;
        border: 1px solid #24543b; border-radius: 18px;
      }
      .daily-icon { font-size: 40px; margin-bottom: 12px; }
      #dailyQuestionText { font-size: 19px; font-weight: 700; line-height: 1.6; }
      .daily-options { display: grid; gap: 10px; margin: 18px 0; }
      .daily-option {
        padding: 14px; text-align: left; color: white;
        background: #0b2b1d; border: 1px solid #286343;
        border-radius: 12px; cursor: pointer;
      }
      .daily-option.selected { border: 2px solid #32e98a; }
      .daily-option:disabled { opacity: .75; cursor: default; }
      .daily-feedback { margin-top: 14px; line-height: 1.6; }
      .daily-winner {
        margin-top: 14px; padding: 12px;
        border-radius: 12px; background: rgba(50,233,138,.08);
      }
      .daily-winner:empty { display: none; }
      .daily-student-select {
        display: block; width: 100%; padding: 12px;
        margin: 12px 0; border-radius: 10px;
      }
      @media(max-width:480px) {
        .daily-question { padding: 15px; }
        .daily-card { padding: 14px; }
      }
    `;

    document.head.appendChild(style);

    const main = document.querySelector("main") || document.body;
    main.appendChild(section);
  }

  function loadQuestion() {
    const question = window.DAILY_QUESTION;

    const questionText = document.getElementById("dailyQuestionText");
    const optionsBox = document.getElementById("dailyOptions");
    const checkButton = document.getElementById("dailyCheck");
    const feedback = document.getElementById("dailyFeedback");
    const winnerBox = document.getElementById("dailyWinner");

    if (!question || !question.text ||
        !Array.isArray(question.options) ||
        !question.options.length) {
      questionText.textContent =
        "Hozircha savol joylashtirilmagan. Yangi savol tez orada!";
      optionsBox.innerHTML = "";
      checkButton.hidden = true;
      return;
    }

    questionText.textContent = question.text;
    optionsBox.innerHTML = question.options.map(function (option, index) {
      return `
        <button type="button" class="daily-option"
                data-index="${index}">
          ${String.fromCharCode(65 + index)}) ${escapeHTML(option)}
        </button>
      `;
    }).join("");

    let selected = null;
    let answered = false;

    optionsBox.querySelectorAll(".daily-option").forEach(function (button) {
      button.addEventListener("click", function () {
        if (answered) return;

        selected = Number(button.dataset.index);

        optionsBox.querySelectorAll(".daily-option").forEach(function (item) {
          item.classList.remove("selected");
        });

        button.classList.add("selected");
        feedback.textContent = "";
      });
    });

    checkButton.hidden = false;

    checkButton.onclick = function () {
      if (answered) return;

      if (selected === null) {
        feedback.textContent = "Avval javoblardan birini tanlang.";
        return;
      }

      if (selected !== Number(question.correctIndex)) {
        feedback.textContent =
          "❌ Javob noto‘g‘ri. Yana urinib ko‘rishingiz mumkin.";
        return;
      }

      const students = getStudents();

      if (!students.length) {
        feedback.textContent =
          "O‘quvchilar ro‘yxati data.js faylidan topilmadi. " +
          "Ro‘yxat tuzilishini ulash kerak.";
        return;
      }

      answered = true;
      feedback.textContent = "🎉 To‘g‘ri javob! Endi o‘z ismingizni tanlang.";

      const select = document.createElement("select");
      select.className = "daily-student-select";
      select.innerHTML =
        '<option value="">O‘quvchilar ro‘yxatidan ismingizni tanlang</option>' +
        students.map(function (student, index) {
          const label = student.group
            ? student.name + " — " + student.group
            : student.name;

          return '<option value="' + index + '">' +
            escapeHTML(label) + '</option>';
        }).join("");

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "btn";
      confirm.textContent = "Ismimni tasdiqlash";

      winnerBox.replaceChildren(select, confirm);

      confirm.onclick = async function () {
        if (select.value === "") {
          feedback.textContent = "Iltimos, ismingizni tanlang.";
          return;
        }

        /*
          XAVFSIZLIK ESLATMASI:
          Bu namuna o‘zi yulduz qo‘shmaydi.
          Tasdiqlashni Supabase server funksiyasiga
          ulash zarur. Aks holda ismni soxtalashtirish
          yoki bir necha marta g‘olib bo‘lish mumkin.
        */

        const student = students[Number(select.value)];

        feedback.textContent =
          "Ism tanlandi: " + student.name +
          ". Yulduzlarni xavfsiz qo‘shish uchun " +
          "Supabase bilan ulash hali bajarilishi kerak.";

        confirm.disabled = true;
        select.disabled = true;
      };
    };
  }

  function start() {
    createSection();
    loadQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
