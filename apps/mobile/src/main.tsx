import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './fonts.css';
import './tokens.css';
import './ui.css';
import './benchmark.css';
import './style.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
