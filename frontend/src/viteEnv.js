// viteEnv.js
// Only imported in browser/Vite builds. Never import in Node/Jest.
export function getViteApiUrl() {
  return typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : undefined;
}
