(() => {
  const $ = id => document.getElementById(id);
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  let db, threads = [], activeId = null, chosenFile = null, channel = null, toastTimer;

  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }
  function date(value) {
    return new Date(value).toLocaleString("uk-UA", {day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  function errMessage(error) {
    const m = error?.message || "Невідома помилка";
    if (m.includes("Invalid API key")) return "Неправильний ключ Supabase. Перевір config.js.";
    if (m.includes("Failed to fetch")) return "Немає з'єднання з Supabase. Перевір URL та інтернет.";
    if (m.toLowerCase().includes("row-level security")) return "Supabase відхилив дію. Перевір SQL-політики з інструкції.";
    return m;
  }
  function showConnection(text, good=false) {
    $("connection").textContent = text;
    $("connection").style.color = good ? "#66d8ad" : "#f0b76c";
  }
  function init() {
    if (!window.supabase || !url || !key || url.includes("ВСТАВТЕ") || key.includes("ВСТАВТЕ")) {
      showConnection("Потрібне налаштування Supabase");
      $("threadList").innerHTML = '<div class="hint">Спочатку заповніть SUPABASE_URL і SUPABASE_ANON_KEY у файлі config.js, а потім опублікуйте сайт знову.</div>';
      return;
    }
    db = window.supabase.createClient(url, key);
    loadThreads();
    channel = db.channel("public-board-changes")
      .on("postgres_changes", {event:"*",schema:"public",table:"threads"}, () => loadThreads())
      .on("postgres_changes", {event:"*",schema:"public",table:"posts"}, () => loadThreads())
      .subscribe(status => {
        if (status === "SUBSCRIBED") showConnection("Онлайн · синхронізація активна", true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") showConnection("Перепідключення...");
      });
  }
  async function loadThreads() {
    if (!db) return;
    const {data, error} = await db.from("threads").select("id,title,created_at,posts(id,text,photo_url,created_at)").order("created_at",{ascending:false});
    if (error) { toast(errMessage(error)); showConnection("Помилка з'єднання"); return; }
    threads = data || [];
    $("threadTotal").textContent = threads.length;
    $("threadCount").textContent = `${threads.length} ${threads.length === 1 ? "гілка" : "гілок"}`;
    renderList();
    if (activeId && threads.some(t => t.id === activeId)) renderThread();
    else if (activeId) { activeId = null; showEmpty(); }
    else showEmpty();
  }
  function renderList() {
    const list = $("threadList"); list.innerHTML = "";
    if (!threads.length) { list.innerHTML = '<div class="hint">Поки що немає гілок. Створіть першу!</div>'; return; }
    threads.forEach(t => {
      const b = document.createElement("button"); b.className = "thread" + (activeId === t.id ? " selected" : "");
      const mark = document.createElement("span"); mark.className = "thread-mark"; mark.textContent = "▤";
      const info = document.createElement("span"); info.className = "thread-info";
      const name = document.createElement("b"); name.textContent = t.title;
      const meta = document.createElement("small"); meta.textContent = `${(t.posts || []).length} публ. · ${date(t.created_at)}`;
      info.append(name,meta); b.append(mark,info);
      b.addEventListener("click", () => {activeId=t.id; renderList(); renderThread();});
      list.append(b);
    });
  }
  function showEmpty() {$("empty").classList.remove("hidden");$("threadPanel").classList.add("hidden");renderList();}
  function renderThread() {
    const t = threads.find(x => x.id === activeId); if (!t) return showEmpty();
    $("empty").classList.add("hidden"); $("threadPanel").classList.remove("hidden");
    $("activeTitle").textContent = t.title; $("activeDate").textContent = `Створено ${date(t.created_at)}`;
    const posts = [...(t.posts || [])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    $("postCount").textContent = posts.length; $("posts").innerHTML = "";
    if (!posts.length) $("posts").innerHTML = '<div class="hint">У цій гілці ще немає публікацій. Додайте першу!</div>';
    posts.forEach(p => {
      const card=document.createElement("article");card.className="post";
      const time=document.createElement("time");time.textContent=date(p.created_at);card.append(time);
      if(p.text){const text=document.createElement("p");text.textContent=p.text;card.append(text);}
      if(p.photo_url){const img=document.createElement("img");img.src=p.photo_url;img.alt="Фотографія до публікації";img.loading="lazy";card.append(img);}
      $("posts").append(card);
    });
    renderList();
  }
  function openModal() {$("modal").classList.remove("hidden");$("titleInput").focus();}
  function closeModal() {$("modal").classList.add("hidden");$("threadForm").reset();}
  $("newThread").addEventListener("click",openModal);$("emptyNew").addEventListener("click",openModal);
  $("closeModal").addEventListener("click",closeModal);
  $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
  $("allBtn").addEventListener("click",()=>{activeId=null;showEmpty();});

  $("threadForm").addEventListener("submit",async e=>{
    e.preventDefault(); if(!db)return;
    const title=$("titleInput").value.trim(); if(!title)return;
    const btn=e.submitter;btn.disabled=true;
    const {error}=await db.from("threads").insert({title});
    btn.disabled=false;
    if(error){toast(errMessage(error));return;}
    closeModal();await loadThreads();toast("Гілку створено для всіх!");
  });
  $("photo").addEventListener("change",e=>{
    chosenFile=e.target.files[0]||null;
    if(chosenFile && chosenFile.size>8*1024*1024){toast("Максимальний розмір фото — 8 МБ.");chosenFile=null;e.target.value="";}
    $("fileLabel").textContent=chosenFile?chosenFile.name:"JPG, PNG, WEBP або GIF · до 8 МБ";
    $("previewWrap").classList.toggle("hidden",!chosenFile);
    if(chosenFile)$("preview").src=URL.createObjectURL(chosenFile);
  });
  function clearPhoto(){chosenFile=null;$("photo").value="";$("fileLabel").textContent="JPG, PNG, WEBP або GIF · до 8 МБ";$("previewWrap").classList.add("hidden");$("preview").removeAttribute("src");}
  $("removePhoto").addEventListener("click",clearPhoto);
  $("postForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!db||!activeId)return;
    const text=$("postText").value.trim();if(!text&&!chosenFile)return toast("Напишіть текст або додайте фотографію.");
    const btn=e.submitter;btn.disabled=true;let photo_url=null;
    try {
      if(chosenFile){
        const ext=(chosenFile.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
        const path=`${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const {error:uploadError}=await db.storage.from("board-photos").upload(path,chosenFile,{contentType:chosenFile.type,upsert:false});
        if(uploadError)throw uploadError;
        const {data}=db.storage.from("board-photos").getPublicUrl(path);photo_url=data.publicUrl;
      }
      const {error}=await db.from("posts").insert({thread_id:activeId,text,photo_url});
      if(error)throw error;
      $("postText").value="";clearPhoto();await loadThreads();toast("Публікацію додано для всіх!");
    } catch(error){toast(errMessage(error));}
    finally{btn.disabled=false;}
  });
  init();
})();