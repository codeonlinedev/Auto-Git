import React from 'react';
import MainApp from './components/MainApp';

const vscode = acquireVsCodeApi();

const App: React.FC = () => {
  return <MainApp vscode={vscode} />;
};

export default App;
