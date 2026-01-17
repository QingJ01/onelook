/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // OneLook 品牌色
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',  // 主色
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                // 亮色主题
                surface: {
                    DEFAULT: '#ffffff',
                    secondary: '#f9fafb',
                    tertiary: '#f3f4f6',
                },
                border: {
                    DEFAULT: '#e5e7eb',
                    light: '#f3f4f6',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 2px 8px rgba(0, 0, 0, 0.08)',
                'medium': '0 4px 16px rgba(0, 0, 0, 0.12)',
            },
        },
    },
    plugins: [],
}
