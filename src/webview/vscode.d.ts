interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

declare module '*.css';

declare module 'react-markdown' {
  const ReactMarkdown: any;
  export default ReactMarkdown;
}

declare module 'remark-math' {
  const remarkMath: any;
  export default remarkMath;
}

declare module 'rehype-katex' {
  const rehypeKatex: any;
  export default rehypeKatex;
}

