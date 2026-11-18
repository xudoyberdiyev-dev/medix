/** O24 — mavzu kalitlari va <head> skripti (server komponentidan ham import qilinadi, shu sabab "use client" yoʻq). */
export const THEME_KEY = "yuzplus-theme";
/** Eski kalit (O20 kirish sahifasi) — tanlov yoʻqolmasin. */
export const LEGACY_THEME_KEY = "yuzplus-login-theme";

/** Gidratatsiyadan oldin mavzuni <html> ga qoʻyadi (oq chaqnash yoʻq). */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage,p=s.getItem("${THEME_KEY}")||s.getItem("${LEGACY_THEME_KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("theme-dark");r.dataset.theme=d?"dark":"light";}catch(e){}})();`;
