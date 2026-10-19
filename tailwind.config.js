/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/webview/**/*.{ts,tsx,js,jsx,html}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        vscode: ['var(--vscode-font-family)', 'system-ui', 'sans-serif'],
      },
      colors: {
        vscode: {
          bg: 'var(--vscode-editor-background)',
          fg: 'var(--vscode-editor-foreground)',
          desc: 'var(--vscode-descriptionForeground)',

          border: 'var(--vscode-widget-border)',
          focus: 'var(--vscode-focusBorder)',

          hoverBg: 'var(--vscode-list-hoverBackground)',
          activeBg: 'var(--vscode-list-activeSelectionBackground)',
          activeFg: 'var(--vscode-list-activeSelectionForeground)',

          link: 'var(--vscode-textLink-foreground)',
          iconBg: 'var(--vscode-textBlockQuote-background)',
        }
      }
    },
  },
  plugins: [],
}