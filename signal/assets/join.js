(function(root){
  const key = "sg-join-draft";
  const fields = ["company", "name", "title", "email"];
  const labels = { company: "会社名", name: "氏名", email: "会社のメールアドレス" };
  const missingFields = missing => {
    const names = Array.isArray(missing) ? missing.filter(name => Object.prototype.hasOwnProperty.call(labels, name)) : [];
    return names.length ? names : Object.keys(labels);
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api = {
    draftSave(storage, values) {
      try {
        const draft = Object.fromEntries(fields.map(name => [name, String(values[name] || "")]));
        draft.interest = Array.isArray(values.interest) ? values.interest.slice() : [];
        storage.setItem(key, JSON.stringify(draft));
      } catch (e) {}
    },
    draftRestore(storage) {
      try {
        const draft = JSON.parse(storage.getItem(key));
        if (!draft || !fields.every(name => typeof draft[name] === "string") ||
            !Array.isArray(draft.interest) || !draft.interest.every(value => typeof value === "string")) return null;
        return draft;
      } catch (e) { return null; }
    },
    draftClear(storage) {
      try { storage.removeItem(key); } catch (e) {}
    },
    invalidMessage(why, missing, restored) {
      const suffix = restored ? "入力した内容は残っています。" : "";
      if (why === "fields") return missingFields(missing).map(name => labels[name]).join("・") + "が入力されていません(または形式が正しくありません)。" + suffix;
      if (why === "turnstile") return "ロボットでないことの確認が完了していません。フォーム下の確認(チェック)を済ませてから、もう一度「登録してログイン用リンクを受け取る」を押してください。" + suffix;
      return "会社名・氏名・会社のメールアドレスは必須です。もう一度ご入力ください。";
    },
    markInvalid(form, missing) {
      let first = null;
      for (const name of missingFields(missing)) {
        const input = form.querySelector('input[name="' + name + '"]');
        if (!input) continue;
        input.setAttribute("aria-invalid", "true");
        input.classList.add("bad");
        if (!first) first = input;
      }
      if (first) first.focus();
    }
  };
  root.sgJoin = api;
  if (!root.document) return;
  const form = root.document.getElementById("regform"), box = root.document.getElementById("state");
  if (!form || !box) return;
  const q = new URLSearchParams(root.location.search), st = q.get("state");
  const nextRaw = q.get("next") || "/signal/";
  const next = /^\/signal\/[a-z0-9\/_\-]*\/?(\?[a-z0-9=&_\-]*)?$/i.test(nextRaw) ? nextRaw : "/signal/";
  root.document.getElementById("next").value = next;
  let storage = null;
  try { storage = root.sessionStorage; } catch (e) {}
  form.addEventListener("submit", () => {
    const values = Object.fromEntries(fields.map(name => [name, form.querySelector('input[name="' + name + '"]').value]));
    values.interest = [...form.querySelectorAll('input[name="interest"]:checked')].map(input => input.value);
    api.draftSave(storage, values);
  });
  const messages = {
    sent: `<div class="msg"><strong>ログイン用リンクをお送りしました。</strong><br>メールを開き、リンク先の「ログインする」を押してください(72 時間有効)。届かない場合は迷惑メール箱をご確認ください。</div>`,
    pending: `<div class="msg"><strong>登録を受け付けました。</strong><br>ベータ版は製造業向けの日系企業(メーカー、商社、物流など)の方に限定しているため、内容を確認のうえ、ログイン用のリンクを別のメールでお送りします(通常 1 営業日以内)。</div>`
  };
  const succeeded = st === "sent" || st === "pending";
  if (succeeded) {
    api.draftClear(storage);
    box.innerHTML = messages[st];
    form.hidden = true;
  } else if (st === "invalid") {
    const draft = api.draftRestore(storage);
    if (draft) {
      for (const name of fields) form.querySelector('input[name="' + name + '"]').value = draft[name];
      for (const input of form.querySelectorAll('input[name="interest"]')) input.checked = draft.interest.includes(input.value);
    }
    const why = q.get("why"), missing = (q.get("missing") || "").split(",");
    box.innerHTML = `<div class="msg warn">${esc(api.invalidMessage(why, missing, draft !== null))}</div>`;
    if (why === "fields") api.markInvalid(form, missing);
  }
  root.fetch("/signal/me", {cache:"no-store", credentials:"same-origin"}).then(r => r.json()).then(m => {
    if (succeeded || !m || !m.loggedIn) return;
    form.hidden = true;
    root.document.querySelectorAll("main > p.note").forEach(n => { n.hidden = true; });
    box.innerHTML = `<div class="msg">すでに <strong>${esc(m.company || m.email)}</strong> としてログイン中です。</div><p><a class="btn" href="${esc(next)}">Signal へ進む</a></p><form method="post" action="/signal/logout"><input type="hidden" name="next" value="/signal/join/"><button class="btn alt" type="submit">別のアドレスで登録する(いまのログインを終了)</button></form>`;
  }).catch(() => {});
})(typeof window !== "undefined" ? window : globalThis);
