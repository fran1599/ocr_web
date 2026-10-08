import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './experimental.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App experimental /></React.StrictMode>,
);
