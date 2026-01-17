import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/index.css'
import 'katex/dist/katex.min.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
