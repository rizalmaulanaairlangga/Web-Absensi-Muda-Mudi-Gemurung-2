import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/variables.css';
import './styles/global.css';
import './styles/app.css';

class DebugBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null, stack: '' }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.setState({ stack: String(info?.componentStack || '') }); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <strong>DEBUG: {String(this.state.error && this.state.error.message)}</strong>
          <div>{this.state.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<DebugBoundary><App /></DebugBoundary>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
