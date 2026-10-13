const CONFIG = window.FYPEDIA_CONFIG || {};
const INSFORGE_URL = String(CONFIG.insforgeUrl || "").replace(/\/$/, "");
const INSFORGE_ANON_KEY = String(CONFIG.insforgeAnonKey || "");
const USE_MOCK_DATA = CONFIG.useMockData === true;
const COMMON_EXCLUSIONS = ["reaction", "meme", "prank", "edit", "trailer", "compilation", "sponsored", "podcast", "music video"];

const TOPICS = [
  { id: "black-holes", title: "Black holes", description: "Gravity, event horizons, and what lies beyond", icon: "✦", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "neural-networks", title: "Neural networks", description: "How machines learn patterns from examples", icon: "⌁", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "world-war-ii", title: "World War II", description: "The turning points that reshaped the world", icon: "◎", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "human-anatomy", title: "Human anatomy", description: "A tour through the systems that keep us alive", icon: "♡", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "personal-finance", title: "Personal finance", description: "Build practical habits for saving and spending", icon: "↗", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "python", title: "Python programming", description: "Core ideas for writing your first useful code", icon: "</>", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "climate-science", title: "Climate science", description: "The systems that shape a changing planet", icon: "◌", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "psychology", title: "Psychology", description: "Useful ideas for understanding how people think", icon: "◒", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "calculus", title: "Calculus", description: "Change, motion, and the mathematics behind both", icon: "∫", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=900&h=700&q=85" },
  { id: "startup-strategy", title: "Startup strategy", description: "Build, test, and learn from a sharp first idea", icon: "◆", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&h=700&q=85" }
];

const VIDEOS = [
  { id: "dQw4w9WgXcQ", channel: "Minute Mentor", duration: "0:58", title: topic => `${topic}: the 60-second overview`, description: topic => `A fast educational short introducing ${topic}.` },
  { id: "9bZkp7q19f0", channel: "Bright Basics", duration: "1:12", title: topic => `The core concept behind ${topic}`, description: () => "A beginner-friendly explanation with examples." },
  { id: "kJQP7kiw5Fk", channel: "Study Sprint", duration: "1:24", title: topic => `${topic} explained with an example`, description: () => "A short worked example for learners." }
];

const DEFAULT_STATE = {
  profile: null,
  stats: { dailyMinutes: 0, totalMinutes: 0, completedSessions: 0, topicStats: {} },
  recentTopicIDs: [],
  selectedTopicId: null,
  nav: "home",
  screen: "auth",
  authMode: "signup",
  theme: "dark",
  onboardingTopics: [],
  dailyGoalMinutes: 10,
  session: null,
  modal: null,
  errorMessage: null,
  pendingVerification: null,
  busy: false
};

let state = loadState();
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("fypedia-web-state") || "null");
    const next = { ...DEFAULT_STATE, ...(saved || {}) };
    const hasLiveSession = Boolean(sessionStorage.getItem("fypedia-access-token"));
    const canRestore = USE_MOCK_DATA || next.profile?.localPreview || hasLiveSession;
    next.screen = canRestore && next.profile?.onboardingCompleted ? "app" : canRestore && next.profile ? "onboarding" : "auth";
    if (!canRestore) next.profile = null;
    return next;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  const persistable = { ...state, modal: null, session: state.screen === "session" || state.screen === "preparing" || state.screen === "results" ? state.session : null };
  localStorage.setItem("fypedia-web-state", JSON.stringify(persistable));
}

function accessToken() { return sessionStorage.getItem("fypedia-access-token") || ""; }
function setAccessToken(token) {
  if (token) sessionStorage.setItem("fypedia-access-token", token);
  else sessionStorage.removeItem("fypedia-access-token");
}

async function insforgeRequest(path, options = {}) {
  if (!INSFORGE_URL || !INSFORGE_ANON_KEY) throw new Error("The live InsForge configuration is missing.");
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  if (path.startsWith("/api/auth/")) headers.set("Authorization", `Bearer ${INSFORGE_ANON_KEY}`);
  else if (accessToken()) headers.set("Authorization", `Bearer ${accessToken()}`);
  const response = await fetch(`${INSFORGE_URL}${path}`, { ...options, headers });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) {
    const code = payload?.error || payload?.message || `Request failed (${response.status})`;
    const error = new Error(String(code).replaceAll("_", " "));
    error.status = response.status;
    error.code = String(code);
    throw error;
  }
  return payload;
}

function authPayload(payload, fallbackEmail) {
  const root = payload || {};
  const data = root.data || {};
  const session = root.session || data.session || {};
  const user = root.user || data.user || session.user || {};
  const profile = user.profile || {};
  return {
    accessToken: root.accessToken || root.access_token || data.accessToken || data.access_token || session.accessToken || session.access_token || "",
    refreshToken: root.refreshToken || root.refresh_token || data.refreshToken || data.refresh_token || session.refreshToken || session.refresh_token || "",
    userID: root.userID || root.user_id || data.userID || data.user_id || user.id || session.user_id || "",
    email: root.email || data.email || user.email || fallbackEmail,
    displayName: root.displayName || data.displayName || profile.name || user.name || "Learner",
    favoriteTopics: root.favoriteTopics || root.favorite_topics || data.favoriteTopics || data.favorite_topics || profile.favoriteTopics || profile.favorite_topics || [],
    dailyGoalMinutes: root.dailyGoalMinutes || root.daily_goal_minutes || data.dailyGoalMinutes || data.daily_goal_minutes || profile.dailyGoalMinutes || profile.daily_goal_minutes || 10,
    onboardingCompleted: root.onboardingCompleted ?? root.onboarding_completed ?? data.onboardingCompleted ?? data.onboarding_completed ?? profile.onboardingCompleted ?? profile.onboarding_completed ?? false,
    requireEmailVerification: root.requireEmailVerification ?? root.require_email_verification ?? data.requireEmailVerification ?? data.require_email_verification ?? false
  };
}

async function liveAuthenticate(mode, email, password, displayName) {
  const path = mode === "signup" ? "/api/auth/users?client_type=web" : "/api/auth/sessions?client_type=web";
  const payload = mode === "signup"
    ? { method: null, email, password, name: displayName }
    : { method: "password", email, password, name: null };
  const result = authPayload(await insforgeRequest(path, { method: "POST", body: JSON.stringify(payload) }), email);
  if (result.requireEmailVerification || !result.accessToken) return result;
  setAccessToken(result.accessToken);
  state.profile = { id: result.userID || email, email: result.email || email, displayName: result.displayName || displayName || "Learner", favoriteTopics: result.favoriteTopics || [], dailyGoalMinutes: Number(result.dailyGoalMinutes) || 10, onboardingCompleted: Boolean(result.onboardingCompleted), localPreview: false };
  state.onboardingTopics = state.profile.favoriteTopics || [];
  state.dailyGoalMinutes = state.profile.dailyGoalMinutes;
  state.selectedTopicId = ownedTopics()[0]?.id || null;
  state.errorMessage = null;
  state.pendingVerification = null;
  state.screen = state.profile.onboardingCompleted ? "app" : "onboarding";
  saveState();
  render();
}

async function syncLiveProfile() {
  if (USE_MOCK_DATA || state.profile?.localPreview || !accessToken()) return;
  await insforgeRequest("/api/auth/profiles/current", {
    method: "PATCH",
    body: JSON.stringify({ profile: { name: state.profile.displayName, favorite_topics: state.profile.favoriteTopics, daily_goal_minutes: state.profile.dailyGoalMinutes, onboarding_completed: state.profile.onboardingCompleted } })
  });
}

function render() {
  document.body.dataset.theme = state.theme;
  const app = document.getElementById("app");
  if (state.screen === "auth") app.innerHTML = renderAuth();
  else if (state.screen === "verification") app.innerHTML = renderVerification();
  else if (state.screen === "onboarding") app.innerHTML = renderOnboarding();
  else if (["preparing", "session"].includes(state.screen)) app.innerHTML = renderSession();
  else if (state.screen === "results") app.innerHTML = renderResults();
  else app.innerHTML = renderAppShell();
  document.getElementById("modal-root").innerHTML = state.modal ? renderModal() : "";
  bindInteractiveState();
}

function bindInteractiveState() {
  document.querySelectorAll("[data-focus]").forEach(el => el.focus());
}

function topicById(id) { return TOPICS.find(topic => topic.id === id) || customTopic(id); }
function customTopic(title) {
  const clean = String(title || "Custom topic").trim();
  const id = `custom-${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return { id, title: clean, description: "A personalized feed built from your study interests", icon: "✦", difficulty: "Beginner", image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&h=700&q=85" };
}
function ownedTopics() { return (state.profile?.favoriteTopics || []).map(title => TOPICS.find(topic => topic.title.toLowerCase() === title.toLowerCase()) || customTopic(title)); }
function firstName() { return state.profile?.displayName?.trim().split(/\s+/)[0] || "Learner"; }
function initials() { return firstName().slice(0, 1).toUpperCase(); }
function selectedTopic() { return topicById(state.selectedTopicId || ownedTopics()[0]?.id); }
function safeText(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch])); }
function topicArtwork(topic, className = "topic-art") { return `<div class="${className}" style="background-image: linear-gradient(180deg, rgba(10,12,13,.04), rgba(10,12,13,.67)), url('${topic.image}')"><span class="topic-art-icon">${safeText(topic.icon)}</span></div>`; }
function button(label, action, className = "button") { return `<button class="${className}" data-action="${action}">${label}</button>`; }

function renderAuth() {
  const signUp = state.authMode === "signup";
  return `<main class="auth-page"><section class="auth-panel">
    <div class="auth-brand"><img src="assets/fypedia-logo.png" alt="Fypedia logo" /><h1>Fypedia</h1><p>Turn short-form video into focused learning.</p></div>
    <div class="auth-card card">
      <h2>${signUp ? "Build your study feed" : "Welcome back"}</h2>
      <p class="intro">${signUp ? "Start with a lightweight local profile. You can connect a production auth service when you deploy." : "Pick up where you left off with your personal study feed."}</p>
      ${state.errorMessage ? `<p class="muted" style="color:var(--error);margin:0 0 14px;font-size:13px">${safeText(state.errorMessage)}</p>` : ""}
      <form class="form-stack" data-form="auth">
        ${signUp ? '<label class="label">Name<input class="input" name="name" placeholder="Your name" autocomplete="name" required /></label>' : ""}
        <label class="label">Email<input class="input" type="email" name="email" placeholder="you@example.com" autocomplete="email" required /></label>
        <label class="label">Password<input class="input" type="password" name="password" placeholder="At least 8 characters" minlength="8" autocomplete="current-password" required /></label>
        <button class="button full" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Connecting…" : signUp ? "Create account" : "Log in"} <span aria-hidden="true">→</span></button>
      </form>
      <div class="auth-divider">or</div>
      ${button("Continue locally", "continue-local", "button secondary full")}
      <p class="auth-switch">${signUp ? "Already have an account?" : "Need an account?"} <button data-action="toggle-auth">${signUp ? "Log in" : "Sign up"}</button></p>
      <p class="legal-note">By continuing, you agree to the Terms of Service and acknowledge the Privacy Policy.</p>
    </div>
  </section></main>`;
}

function renderVerification() {
  const email = state.pendingVerification?.email || "your email";
  return `<main class="auth-page"><section class="auth-panel"><div class="auth-brand"><img src="assets/fypedia-logo.png" alt="Fypedia logo" /><h1>Check your email</h1><p>We sent a verification code to ${safeText(email)}.</p></div><div class="auth-card card"><h2>Verify your account</h2><p class="intro">Enter the six-digit code to continue building your study feed.</p>${state.errorMessage ? `<p class="muted" style="color:var(--error);margin:0 0 14px;font-size:13px">${safeText(state.errorMessage)}</p>` : ""}<form class="form-stack" data-form="verify"><label class="label">Verification code<input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6" required /></label><button class="button full" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Verifying…" : "Verify email"} <span>→</span></button></form><div class="auth-divider">or</div><button class="button secondary full" data-action="resend-verification" ${state.busy ? "disabled" : ""}>Resend code</button><p class="auth-switch"><button data-action="back-to-auth">Back to sign in</button></p></div></section></main>`;
}

function renderOnboarding() {
  const selected = new Set(state.onboardingTopics);
  const ready = selected.size >= 3;
  const customTopics = state.onboardingTopics.filter(title => !TOPICS.some(topic => topic.title.toLowerCase() === title.toLowerCase()));
  return `<main class="onboarding-page"><section class="onboarding-panel">
    <div class="brand" style="margin-bottom: 26px"><img src="assets/fypedia-logo.png" alt="" /><span class="brand-name">Fypedia</span></div>
    <div class="onboarding-head"><div><p class="eyebrow">Your starting point</p><h1>Choose your study stack</h1><p>Pick at least three topics. You can add more from the home screen anytime.</p></div><span class="count-pill ${ready ? "ready" : ""}">${selected.size}/3 selected</span></div>
    <div class="card" style="padding: 20px"><div class="onboarding-topics">${TOPICS.map(topic => `<button class="topic-chip ${selected.has(topic.title) ? "selected" : ""}" data-action="toggle-onboarding-topic" data-topic="${safeText(topic.title)}">${safeText(topic.icon)} ${safeText(topic.title)}</button>`).join("")}${customTopics.map(title => `<button class="topic-chip selected" data-action="toggle-onboarding-topic" data-topic="${safeText(title)}">✦ ${safeText(title)}</button>`).join("")}</div>
      <form class="search-row" data-form="custom-onboarding"><input class="input" name="topic" placeholder="Add a custom topic" /><button class="button secondary" type="submit">Add</button></form>
      <div class="section" style="margin-top: 24px"><div class="section-heading"><div><h2>Daily goal</h2><p>How much time should Fypedia help you protect?</p></div></div><div class="goal-options">${[5,10,20].map(minutes => `<button class="goal-option ${state.dailyGoalMinutes === minutes ? "selected" : ""}" data-action="set-goal" data-goal="${minutes}"><strong>${minutes}m</strong><span>${minutes === 5 ? "A quick start" : minutes === 10 ? "A focused session" : "A deeper practice"}</span></button>`).join("")}</div></div>
    </div>
    <div class="onboarding-actions"><button class="button ghost" data-action="back-to-auth">Back</button><button class="button" data-action="complete-onboarding" ${ready ? "" : "disabled"}>Build my feed <span>→</span></button></div>
  </section></main>`;
}

function renderAppShell() {
  const titles = { home: ["Good to see you", `A small, focused session is waiting, ${safeText(firstName())}.`], library: ["Your library", "Keep the ideas you want to return to close."], profile: ["Settings", "Your profile, goals, and account controls."] };
  const [title, subtitle] = titles[state.nav] || titles.home;
  return `<div class="app-shell"><aside class="rail"><div><a class="brand" href="#" data-action="go-home"><img src="assets/fypedia-logo.png" alt="Fypedia" /><span class="brand-name">Fypedia</span></a><p class="brand-subtitle">Personal study feed</p></div><nav><p class="nav-label">Workspace</p><div class="nav-list">${renderNavButton("home", "⌂", "Home")}${renderNavButton("library", "▤", "Library")}${renderNavButton("profile", "◎", "Profile")}</div></nav><div class="rail-footer"><strong>${state.stats.completedSessions} sessions completed</strong><span>${state.stats.totalMinutes} minutes of learning logged.</span></div></aside><main class="main"><div class="main-inner"><header class="topbar"><div><p class="eyebrow">FYPEDIA / ${state.nav}</p><h1>${title}</h1><p>${subtitle}</p></div><div class="topbar-actions"><span class="session-count">✦ ${state.stats.completedSessions}</span><button class="avatar" data-action="nav-profile" aria-label="Open profile">${initials()}</button></div></header>${state.nav === "home" ? renderHome() : state.nav === "library" ? renderLibrary() : renderProfile()}</div></main></div>`;
}

function renderNavButton(id, icon, label) { return `<button class="nav-button ${state.nav === id ? "active" : ""}" data-action="nav" data-nav="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`; }

function renderHome() {
  const topics = ownedTopics();
  const selected = selectedTopic();
  const discover = TOPICS.filter(topic => !topics.some(owned => owned.title.toLowerCase() === topic.title.toLowerCase())).slice(0, 6);
  const dailyGoal = state.profile?.dailyGoalMinutes || 10;
  const progress = Math.min(100, Math.round((state.stats.dailyMinutes / Math.max(dailyGoal, 1)) * 100));
  return `<section class="card learning-strip"><div><p class="eyebrow">Watch next</p><h2>${state.stats.dailyMinutes} of ${dailyGoal} minutes</h2><p class="sub">${progress >= 100 ? "Goal met — nice work." : "A little progress compounds."}</p></div>${button(selected ? "Start session →" : "Choose a topic", "start-session", "button") }<div class="strip-progress"><div class="progress-track"><span style="width:${progress}%"></span></div><div class="progress-label"><span>${progress}% complete</span><span>${Math.max(0, dailyGoal - state.stats.dailyMinutes)}m left</span></div></div></section>
    <section class="section"><div class="section-heading"><div><h2>My topics</h2><p>Choose what you want to learn next.</p></div>${button("Edit topics", "nav-library", "text-button")}</div><div class="topic-grid">${topics.slice(0, 6).map(topicCard).join("")}</div></section>
    <section class="section"><div class="section-heading"><div><h2>Explore more</h2><p>Add a topic now, or browse the shelf below.</p></div></div><form class="search-row" data-form="add-topic"><input class="input" name="topic" placeholder="Search or add a topic" /><button class="button secondary" type="submit">Add topic</button></form><div class="discover-grid">${discover.length ? discover.map(discoverCard).join("") : '<div class="empty-state">You have added every featured topic. Try a custom topic above.</div>'}</div></section>`;
}

function topicCard(topic) {
  const selected = state.selectedTopicId === topic.id;
  const stat = state.stats.topicStats?.[topic.id] || { sessions: 0, accuracy: 0 };
  return `<button class="topic-card ${selected ? "selected" : ""}" data-action="select-topic" data-topic-id="${topic.id}"><span class="selection-dot" aria-hidden="true"></span>${topicArtwork(topic)}<div class="topic-copy"><h3>${safeText(topic.title)}</h3><p>${safeText(topic.description)}</p><div class="topic-meta"><span>${topic.difficulty}</span><span>${stat.sessions ? `${stat.sessions} sessions` : "Not started"}</span></div></div></button>`;
}

function discoverCard(topic) { return `<article class="discover-card"><button class="topic-card" style="border:0;border-radius:0;min-height:0" data-action="add-topic-card" data-topic-id="${topic.id}">${topicArtwork(topic)}<div class="discover-plus">+</div><div class="topic-copy"><h3>${safeText(topic.title)}</h3><div class="topic-meta"><span>${topic.difficulty}</span></div></div></button></article>`; }

function renderLibrary() {
  const topics = ownedTopics();
  return `<section><div class="section-heading"><div><h2>Study shelf</h2><p>${topics.length} topic${topics.length === 1 ? "" : "s"} in your personalized feed.</p></div></div><form class="search-row" data-form="add-topic"><input class="input" name="topic" placeholder="Add a custom topic" /><button class="button" type="submit">Add topic</button></form><div class="library-list">${topics.map(topic => { const stat = state.stats.topicStats?.[topic.id] || { sessions: 0, accuracy: 0 }; return `<article class="library-row card">${topicArtwork(topic)}<div><h3>${safeText(topic.title)}</h3><p>${safeText(topic.description)}</p></div><div style="display:grid;gap:7px;justify-items:end"><span class="stat-chip">${stat.sessions ? `${stat.accuracy}% accuracy` : "New"}</span><button class="button danger small" data-action="remove-topic" data-topic-id="${topic.id}" ${topics.length <= 1 ? "disabled" : ""}>Remove</button></div></article>`; }).join("")}</div></section>`;
}

function renderProfile() {
  const total = state.stats.totalMinutes;
  const average = state.stats.completedSessions ? Math.max(1, Math.round(total / state.stats.completedSessions)) : 0;
  return `<section class="profile-grid"><div class="card profile-card"><div class="profile-header"><div class="profile-avatar">${initials()}</div><div><h2>${safeText(state.profile?.displayName || "Learner")}</h2><p>${safeText(state.profile?.email || "Local preview profile")}</p></div></div><div class="stats-grid"><div class="stat"><strong>${state.stats.completedSessions}</strong><span>Sessions</span></div><div class="stat"><strong>${total}</strong><span>Total minutes</span></div><div class="stat"><strong>${average}</strong><span>Avg. per session</span></div></div></div><div class="settings-stack"><div class="settings-card card"><h3>Appearance</h3><div class="segmented"><button class="${state.theme === "light" ? "active" : ""}" data-action="set-theme" data-theme="light">Light</button><button class="${state.theme === "dark" ? "active" : ""}" data-action="set-theme" data-theme="dark">Dark</button></div></div><div class="settings-card card"><h3>Account</h3><div class="settings-row"><button class="button ghost" data-action="nav-library">Edit topics</button></div><div class="settings-row"><button class="button ghost" data-action="open-privacy">Privacy policy</button></div><div class="settings-row"><button class="button ghost" data-action="open-terms">Terms of service</button></div><div class="settings-row"><button class="button ghost" data-action="open-support">Support</button></div></div><div class="settings-card card"><h3>Session</h3><div class="settings-row"><span>Daily goal</span><strong>${state.profile?.dailyGoalMinutes || 10} min</strong></div><div class="settings-row"><button class="button danger full" data-action="sign-out">Sign out</button></div><div class="settings-row"><button class="button danger full" data-action="delete-account">Delete account</button></div></div></div></section>`;
}

function renderSession() {
  if (state.screen === "preparing") return renderPreparing();
  const session = state.session;
  const video = session.videos[session.index];
  const topic = topicById(session.topicId);
  const progress = session.videos.map((_, index) => `<span class="${index <= session.index ? "active" : ""}"></span>`).join("");
  const embed = `https://www.youtube.com/embed/${video.id}?playsinline=1&rel=0&modestbranding=1&controls=1`;
  const hasLiveEmbed = !video.demo && Boolean(video.id);
  const videoViewer = hasLiveEmbed
    ? `<iframe src="${embed}" title="${safeText(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<div class="video-fallback"><div><div class="video-orb">▶</div><p class="eyebrow" style="margin-top:18px">Demo clip · ${safeText(video.channel)} · ${video.duration}</p><h2>${safeText(video.title)}</h2><p>${safeText(video.description)} This browser build is using the app’s local mock pipeline; connect the existing YouTube search function to replace this card with a live Short.</p>${button("Open clip on YouTube ↗", "open-youtube", "button secondary")}</div></div>`;
  const videoOverlay = hasLiveEmbed ? `<div class="video-overlay"><span class="video-label">${safeText(topic.title)} · CLIP ${session.index + 1} OF ${session.videos.length}</span><div class="video-info"><p>${safeText(video.channel)} · ${video.duration}</p><h1>${safeText(video.title)}</h1><p>${safeText(video.description)}</p></div></div>` : "";
  const content = `<div class="session-page"><div class="session-shell"><main class="session-main"><div class="session-top"><button class="session-back" data-action="leave-session">← Topics</button><div class="session-progress" aria-label="Clip ${session.index + 1} of ${session.videos.length}">${progress}</div><button class="session-back" data-action="show-question">Check</button></div><div class="video-stage">${videoViewer}${videoOverlay}</div><div class="session-footer">${button("Previous", "previous-clip", "button secondary")}${button(session.index === session.videos.length - 1 ? "Finish session" : "Knowledge check →", "show-question", "button")}</div></main><aside class="session-rail"><p class="eyebrow">Focused session</p><h2>${safeText(topic.title)}</h2><p class="rail-copy">Watch a short, then use one question to turn attention into understanding.</p><div class="session-note"><h3>The big picture</h3><p>Start with the simplest useful model of ${safeText(topic.title)}, then connect it to an example and a self-check.</p></div><div class="rail-actions">${button("Open on YouTube ↗", `open-youtube`, "button secondary")}${button("I’m ready — show question", "show-question", "button")}</div></aside></div></div>`;
  return state.session.questionOpen ? content + renderQuestionSheet() : content;
}

function renderPreparing() {
  const topic = topicById(state.session?.topicId || state.selectedTopicId);
  const stage = state.session?.prepStage || 0;
  const steps = ["Finding relevant Shorts", "Checking playback", "Writing questions", "Setting the order"];
  if (state.session?.error) return `<div class="session-page"><div class="preparing-card card"><div class="preparing-icon">!</div><p class="eyebrow">Session unavailable</p><h1>We couldn’t prepare this feed</h1><p>${safeText(state.session.error)}</p><div class="onboarding-actions"><button class="button secondary" data-action="leave-session">Choose another topic</button><button class="button" data-action="retry-preparation">Try again →</button></div></div></div>`;
  return `<div class="session-page"><div class="preparing-card card"><div class="preparing-icon">${safeText(topic.icon)}</div><p class="eyebrow">Preparing your feed</p><h1>${safeText(topic.title)}</h1><p>${steps[Math.min(stage, steps.length - 1)]}…</p><div class="prep-steps">${steps.map((step, index) => `<div class="prep-step ${index < stage ? "done" : index === stage ? "active" : ""}"><span class="prep-dot"></span><span>${step}</span>${index < stage ? "<span style=\"margin-left:auto\">✓</span>" : ""}</div>`).join("")}</div></div></div>`;
}

function currentQuestion(topic, index) {
  const liveQuestion = state.session?.videos?.[index]?.question;
  if (liveQuestion) return { prompt: liveQuestion.question, choices: liveQuestion.options, correct: liveQuestion.correctOptionIndex, explanation: liveQuestion.explanation, evidence: liveQuestion.supportingEvidence || "This answer is grounded in the video transcript." };
  const concepts = ["the simplest useful model", "how the parts connect", "why the idea matters"];
  return { prompt: `Which idea is most useful to remember after this short about ${topic.title}?`, choices: [`${concepts[index % 3].replace(/^the /, "The ")}`, "Memorize every detail before trying an example", "Skip the definitions and jump to advanced material", "Treat one example as the entire subject"], correct: 0, explanation: `A focused mental model helps you connect the short to a larger understanding of ${topic.title}.`, evidence: `The short frames ${topic.title} as a concept to understand through structure, examples, and an active recall check.` };
}

function renderQuestionSheet() {
  const session = state.session;
  const topic = topicById(session.topicId);
  const question = currentQuestion(topic, session.index);
  const answered = session.answers[session.index];
  return `<div class="question-backdrop"><section class="question-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="question-meta"><span>KNOWLEDGE CHECK · CLIP ${session.index + 1} OF ${session.videos.length}</span><span>${answered ? "ANSWERED" : "ANSWER"}</span></div><h2>${safeText(question.prompt)}</h2><div class="choices">${question.choices.map((choice, index) => { const chosen = answered?.selected === index; const correct = question.correct === index; const cls = answered ? (correct ? "correct" : chosen ? "incorrect" : "") : ""; return `<button class="choice ${cls}" data-action="answer" data-answer="${index}" ${answered ? "disabled" : ""}><span class="choice-letter">${String.fromCharCode(65 + index)}</span><span>${safeText(choice)}</span></button>`; }).join("")}</div>${answered ? `<div class="evidence"><strong>${answered.correct ? "Nice — that matches the core idea." : "Keep this one in your review set."}</strong><p>${safeText(question.explanation)}</p><p style="margin-top:8px"><strong>Evidence:</strong> ${safeText(question.evidence)}</p></div><div class="question-actions">${button(session.index === session.videos.length - 1 ? "See session summary →" : "Continue learning →", "continue-question", "button full")}</div>` : ""}</section></div>`;
}

function renderResults() {
  const session = state.session;
  const answers = session.answers;
  const correct = answers.filter(answer => answer.correct).length;
  const percentage = answers.length ? Math.round(correct / answers.length * 100) : 0;
  const label = percentage >= 85 ? "Strong grasp" : percentage >= 60 ? "Building confidence" : "Ready to review";
  const topic = topicById(session.topicId);
  return `<div class="results-page"><div class="results-shell"><div class="results-head"><button class="button ghost" data-action="leave-results">× Close</button><h1>Session summary</h1><button class="text-button" data-action="leave-results">Done</button></div><section class="mastery-card"><div class="mastery-top"><div class="mastery-ring" style="--score:${percentage * 3.6}deg"><span>${percentage}%</span></div><div><p class="eyebrow" style="color:rgba(20,22,22,.58)">${safeText(topic.title)}</p><h2>${label}</h2><p>You answered ${correct} of ${answers.length} knowledge checks correctly.</p></div></div><div class="metrics"><div class="metric"><strong>${session.videos.length}</strong><span>Shorts</span></div><div class="metric"><strong>${correct}/${answers.length}</strong><span>Checks</span></div><div class="metric"><strong>1 min</strong><span>Duration</span></div></div></section><section class="results-section"><h2>Learning summary</h2><p>${percentage >= 60 ? `You built a useful first pass through ${safeText(topic.title)}. Keep the model simple, then return to the idea that felt least automatic.` : `This was a first pass through ${safeText(topic.title)}. A second, shorter review will help the structure stick.`}</p><div class="insight-grid"><div class="insight"><h3>Keep</h3><p>Start with the simplest useful model.</p></div><div class="insight"><h3>Next</h3><p>Use one concrete example to test your understanding.</p></div></div></section><section class="results-section"><h2>Knowledge check breakdown</h2><div class="answer-list">${answers.map((answer, index) => `<div class="answer-row"><span class="answer-number">${index + 1}</span><div><strong>Clip ${index + 1} · ${safeText(topic.title)}</strong><span>${answer.correct ? "Core idea identified" : "Review the explanation once more"}</span></div><span class="answer-status ${answer.correct ? "correct" : "incorrect"}">${answer.correct ? "Correct" : "Review"}</span></div>`).join("")}</div></section><div class="results-actions">${button("Learn another topic →", "leave-results", "button full")}${button("Review completed session", "review-session", "button secondary full")}${button("Retry knowledge check", "retry-session", "button ghost full")}</div></div></div>`;
}

function renderModal() {
  const content = state.modal === "privacy" ? ["Privacy policy", "Fypedia stores your profile, selected topics, learning stats, and preferences locally in this browser preview. Production deployments should connect these controls to the same authenticated services used by the iOS app. We do not put provider API keys in the browser bundle."] : state.modal === "terms" ? ["Terms of service", "Fypedia is a learning aid, not a substitute for professional advice. Video availability, generated questions, and third-party content may change. Use the service responsibly and review important information against trusted sources."] : ["Support", "Need help? The web preview is intentionally self-contained. For a production launch, connect the existing InsForge auth, YouTube search, question-generation, and account-deletion functions to this frontend through authenticated API calls."];
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" data-modal-content><div class="modal-head"><h2>${content[0]}</h2><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div><p>${content[1]}</p></section></div>`;
}

function topicSearchRequest(topic) {
  const keywordTokens = topic.title.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
  return {
    queries: [`${topic.title} explained for beginners #shorts`, `how ${topic.title} works short`, `${topic.title} basics educational shorts`],
    requiredKeywords: keywordTokens,
    excludedKeywords: COMMON_EXCLUSIONS,
    preferredChannels: ["Khan Academy", "TED-Ed", "CrashCourse", "Kurzgesagt", "NASA", "3Blue1Brown"],
    regionCode: "US",
    language: "en",
    candidatesPerSearch: 25
  };
}

async function prepareLiveSession(topic) {
  state.session.prepStage = 0;
  render();
  const searchResult = await insforgeRequest("/functions/search-youtube-shorts", { method: "POST", body: JSON.stringify(topicSearchRequest(topic)) });
  const candidates = Array.isArray(searchResult?.videos) ? searchResult.videos.filter(video => video?.id && video?.isEmbeddable !== false) : [];
  if (candidates.length < 3) throw new Error("We couldn’t find enough usable educational Shorts for this topic.");
  state.session.prepStage = 1;
  render();
  const selected = candidates.slice(0, Math.min(8, candidates.length));
  const questions = [];
  for (const video of selected) {
    state.session.prepStage = 2;
    render();
    try {
      const questionResult = await insforgeRequest("/functions/generate-learning-questions", {
        method: "POST",
        body: JSON.stringify({
          videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
          prompt: `Generate exactly one clear, video-grounded multiple-choice question for a learner studying ${topic.title}. Use only facts supported by the video transcript. Keep the question concise and include four distinct options.`
        })
      });
      const question = Array.isArray(questionResult?.questions) ? questionResult.questions[0] : questionResult?.question;
      if (question?.question && Array.isArray(question.options) && question.options.length === 4) questions.push({ video, question });
    } catch (error) {
      // A Short may be embeddable but have no transcript. Match the native
      // pipeline by skipping that candidate and trying the backup pool.
      if ([401, 403].includes(error.status)) throw error;
    }
    if (questions.length >= 3) break;
  }
  if (questions.length < 3) throw new Error("The question service could not create enough grounded questions for this session.");
  state.session.prepStage = 3;
  render();
  await new Promise(resolve => setTimeout(resolve, 350));
  state.session.videos = questions.map(({ video, question }) => ({
    id: video.id,
    channel: video.channelTitle || "YouTube",
    duration: formatDuration(video.durationSeconds),
    title: video.title,
    description: video.description || "A short educational video.",
    thumbnailURL: video.thumbnailURL || "",
    question,
    demo: false
  }));
  state.screen = "session";
  render();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function beginSession() {
  const topic = selectedTopic();
  if (!topic) return toast("Choose a topic first.");
  const videos = USE_MOCK_DATA ? VIDEOS.map(video => ({ id: video.id, channel: video.channel, duration: video.duration, title: video.title(topic.title), description: video.description(topic.title), demo: true })) : [];
  state.session = { topicId: topic.id, videos, index: 0, prepStage: 0, questionOpen: false, answers: [], completedRecorded: false, error: null };
  state.screen = "preparing";
  saveState();
  render();
  if (USE_MOCK_DATA) {
    [1, 2, 3].forEach((stage, index) => setTimeout(() => { if (state.screen === "preparing" && state.session) { state.session.prepStage = stage; render(); } }, 650 * (index + 1)));
    setTimeout(() => { if (state.screen === "preparing" && state.session) { state.screen = "session"; render(); } }, 2600);
  } else {
    prepareLiveSession(topic).catch(error => { if (!state.session) return; state.session.error = error.message || "The live learning services could not prepare this session."; render(); });
  }
}

function finishSession() {
  const session = state.session;
  if (!session || session.completedRecorded) return;
  session.completedRecorded = true;
  const topic = topicById(session.topicId);
  const correct = session.answers.filter(answer => answer.correct).length;
  const current = state.stats.topicStats[topic.id] || { sessions: 0, accuracy: 0, correct: 0, total: 0 };
  current.sessions += 1;
  current.correct += correct;
  current.total += session.answers.length;
  current.accuracy = current.total ? Math.round(current.correct / current.total * 100) : 0;
  state.stats.topicStats[topic.id] = current;
  state.stats.completedSessions += 1;
  state.stats.dailyMinutes += 1;
  state.stats.totalMinutes += 1;
  state.recentTopicIDs = [topic.id, ...state.recentTopicIDs.filter(id => id !== topic.id)].slice(0, 8);
  state.screen = "results";
  saveState();
  render();
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function addTopicTitle(title) {
  const clean = String(title || "").trim().replace(/\s+/g, " ");
  if (clean.length < 2) return toast("Enter a topic with at least two characters.");
  const topics = state.profile.favoriteTopics || [];
  if (topics.some(topic => topic.toLowerCase() === clean.toLowerCase())) return toast("That topic is already in your library.");
  topics.push(clean.slice(0, 80));
  state.profile.favoriteTopics = topics;
  state.selectedTopicId = (TOPICS.find(topic => topic.title.toLowerCase() === clean.toLowerCase()) || customTopic(clean)).id;
  saveState();
  render();
  toast(`${clean} added to your library.`);
}

async function handleAction(action, target) {
  if (action === "toggle-auth") { state.authMode = state.authMode === "signup" ? "signin" : "signup"; render(); return; }
  if (action === "continue-local") { state.profile = { id: crypto.randomUUID?.() || String(Date.now()), email: "", displayName: "Learner", favoriteTopics: [], dailyGoalMinutes: 10, onboardingCompleted: false, localPreview: true }; state.screen = "onboarding"; saveState(); render(); return; }
  if (action === "back-to-auth") { state.profile = null; state.pendingVerification = null; state.errorMessage = null; state.screen = "auth"; saveState(); render(); return; }
  if (action === "resend-verification") { if (!state.pendingVerification) return; state.busy = true; state.errorMessage = null; render(); try { await insforgeRequest("/api/auth/email/send-verification", { method: "POST", body: JSON.stringify({ email: state.pendingVerification.email, redirectTo: null }) }); toast("A new verification code was sent."); } catch (error) { state.errorMessage = error.message || "The verification email could not be sent."; } finally { state.busy = false; render(); } return; }
  if (action === "toggle-onboarding-topic") { const title = target.dataset.topic; state.onboardingTopics = state.onboardingTopics.includes(title) ? state.onboardingTopics.filter(item => item !== title) : [...state.onboardingTopics, title]; render(); return; }
  if (action === "set-goal") { state.dailyGoalMinutes = Number(target.dataset.goal); render(); return; }
  if (action === "complete-onboarding") { if (state.onboardingTopics.length < 3) return toast("Choose at least three topics to continue."); state.profile.favoriteTopics = [...state.onboardingTopics]; state.profile.dailyGoalMinutes = state.dailyGoalMinutes; state.profile.onboardingCompleted = true; state.selectedTopicId = (ownedTopics()[0] || TOPICS[0]).id; state.nav = "home"; state.screen = "app"; saveState(); render(); if (!state.profile.localPreview) { try { await syncLiveProfile(); } catch (error) { toast(`Profile sync failed: ${error.message}`); } } return; }
  if (action === "nav" || action === "nav-library" || action === "nav-profile" || action === "go-home") { state.nav = action === "nav" ? target.dataset.nav : action === "nav-library" ? "library" : action === "nav-profile" ? "profile" : "home"; state.screen = "app"; render(); return; }
  if (action === "select-topic") { state.selectedTopicId = target.dataset.topicId; render(); return; }
  if (action === "add-topic-card") { addTopicTitle(topicById(target.dataset.topicId).title); return; }
  if (action === "start-session") { beginSession(); return; }
  if (action === "retry-preparation") { beginSession(); return; }
  if (action === "leave-session" || action === "leave-results") { state.session = null; state.screen = "app"; state.nav = "home"; saveState(); render(); return; }
  if (action === "previous-clip") { if (state.session && state.session.index > 0) { state.session.index -= 1; state.session.questionOpen = false; render(); } return; }
  if (action === "show-question") { if (state.session) { state.session.questionOpen = true; render(); } return; }
  if (action === "answer") { if (!state.session) return; const index = Number(target.dataset.answer); const question = currentQuestion(topicById(state.session.topicId), state.session.index); state.session.answers[state.session.index] = { selected: index, correct: index === question.correct }; render(); return; }
  if (action === "continue-question") { if (!state.session?.answers[state.session.index]) return; state.session.questionOpen = false; if (state.session.index < state.session.videos.length - 1) { state.session.index += 1; render(); } else if (state.session.completedRecorded) { state.screen = "results"; render(); } else finishSession(); return; }
  if (action === "retry-session") { const topic = topicById(state.session?.topicId); state.selectedTopicId = topic.id; beginSession(); return; }
  if (action === "review-session") { if (!state.session) return; state.screen = "session"; state.session.index = 0; state.session.questionOpen = false; render(); return; }
  if (action === "remove-topic") { const topics = ownedTopics(); if (topics.length <= 1) return toast("Keep at least one topic in your library."); const id = target.dataset.topicId; const removed = topicById(id); state.profile.favoriteTopics = state.profile.favoriteTopics.filter(title => title.toLowerCase() !== removed.title.toLowerCase()); if (state.selectedTopicId === id) state.selectedTopicId = ownedTopics()[0]?.id; saveState(); render(); toast(`${removed.title} removed.`); return; }
  if (action === "set-theme") { state.theme = target.dataset.theme; saveState(); render(); return; }
  if (action === "sign-out") { setAccessToken(""); state = { ...DEFAULT_STATE, theme: state.theme }; saveState(); render(); toast("Signed out."); return; }
  if (action === "delete-account") { if (!confirm("Delete this Fypedia account and all associated data? This cannot be undone.")) return; if (!state.profile?.localPreview && accessToken()) { try { await insforgeRequest("/functions/delete-account", { method: "POST", body: "{}" }); } catch (error) { return toast(`Account deletion failed: ${error.message}`); } } setAccessToken(""); localStorage.removeItem("fypedia-web-state"); state = { ...DEFAULT_STATE }; render(); return; }
  if (action === "open-privacy" || action === "open-terms" || action === "open-support") { state.modal = action === "open-privacy" ? "privacy" : action === "open-terms" ? "terms" : "support"; render(); return; }
  if (action === "close-modal") { if (target.closest("[data-modal-content]") && target.dataset.action === "close-modal" && target.tagName !== "BUTTON") return; state.modal = null; render(); return; }
  if (action === "open-youtube") { const video = state.session?.videos[state.session.index]; if (video) window.open(`https://www.youtube.com/watch?v=${video.id}`, "_blank", "noopener"); return; }
}

document.addEventListener("click", event => { const target = event.target.closest("[data-action]"); if (target) { event.preventDefault(); handleAction(target.dataset.action, target); } });
document.addEventListener("submit", async event => {
  const form = event.target;
  if (!form.matches("[data-form]")) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === "auth") {
    const password = String(data.get("password") || "");
    if (password.length < 8) return toast("Use a password with at least 8 characters.");
    const email = String(data.get("email") || "").trim();
    const name = String(data.get("name") || "Learner").trim() || "Learner";
    state.busy = true;
    state.errorMessage = null;
    render();
    try {
      if (USE_MOCK_DATA) {
        state.profile = { id: crypto.randomUUID?.() || String(Date.now()), email, displayName: name, favoriteTopics: [], dailyGoalMinutes: 10, onboardingCompleted: false, localPreview: true };
        state.screen = "onboarding";
      } else {
        const mode = state.authMode;
        const result = authPayload(await insforgeRequest(mode === "signup" ? "/api/auth/users?client_type=web" : "/api/auth/sessions?client_type=web", { method: "POST", body: JSON.stringify(mode === "signup" ? { method: null, email, password, name } : { method: "password", email, password, name: null }) }), email);
        if (result.requireEmailVerification || !result.accessToken) {
          state.pendingVerification = { email, displayName: name };
          state.screen = "verification";
        } else {
          setAccessToken(result.accessToken);
          state.profile = { id: result.userID || email, email: result.email || email, displayName: result.displayName || name, favoriteTopics: result.favoriteTopics || [], dailyGoalMinutes: Number(result.dailyGoalMinutes) || 10, onboardingCompleted: Boolean(result.onboardingCompleted), localPreview: false };
          state.onboardingTopics = state.profile.favoriteTopics || [];
          state.dailyGoalMinutes = state.profile.dailyGoalMinutes;
          state.selectedTopicId = ownedTopics()[0]?.id || null;
          state.screen = state.profile.onboardingCompleted ? "app" : "onboarding";
        }
      }
      state.errorMessage = null;
    } catch (error) {
      state.errorMessage = error.message || "The account service could not be reached.";
    } finally {
      state.busy = false;
      saveState();
      render();
    }
    return;
  }
  if (form.dataset.form === "verify") {
    const code = String(data.get("code") || "").trim();
    if (!/^\d{6}$/.test(code)) return toast("Enter the 6-digit verification code.");
    state.busy = true; state.errorMessage = null; render();
    try {
      const pending = state.pendingVerification;
      const result = authPayload(await insforgeRequest("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ email: pending.email, otp: code }) }), pending.email);
      if (!result.accessToken) throw new Error("InsForge did not return a usable session.");
      setAccessToken(result.accessToken);
      state.profile = { id: result.userID || pending.email, email: result.email || pending.email, displayName: result.displayName || pending.displayName || "Learner", favoriteTopics: result.favoriteTopics || [], dailyGoalMinutes: Number(result.dailyGoalMinutes) || 10, onboardingCompleted: Boolean(result.onboardingCompleted), localPreview: false };
      state.onboardingTopics = state.profile.favoriteTopics || [];
      state.dailyGoalMinutes = state.profile.dailyGoalMinutes;
      state.selectedTopicId = ownedTopics()[0]?.id || null;
      state.pendingVerification = null;
      state.screen = state.profile.onboardingCompleted ? "app" : "onboarding";
    } catch (error) {
      state.errorMessage = error.message || "The verification service could not be reached.";
    } finally { state.busy = false; saveState(); render(); }
    return;
  }
  if (form.dataset.form === "custom-onboarding") {
    const value = String(data.get("topic") || "").trim();
    if (value.length < 2) return toast("Enter a topic with at least two characters.");
    if (!state.onboardingTopics.some(topic => topic.toLowerCase() === value.toLowerCase())) state.onboardingTopics = [...state.onboardingTopics, value];
    render(); return;
  }
  if (form.dataset.form === "add-topic") { addTopicTitle(data.get("topic")); }
});

document.addEventListener("keydown", event => { if (event.key === "Escape" && state.modal) { state.modal = null; render(); } });

render();
