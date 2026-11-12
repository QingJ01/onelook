import { ref } from 'vue'

export type Theme = 'light' | 'dark'
const key = 'onelook-ui-theme'
function storedTheme(): Theme {
  try { return localStorage.getItem(key) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}
export const theme = ref<Theme>(storedTheme())
export function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  try { localStorage.setItem(key, theme.value) } catch { /* Theme still works without storage. */ }
}
