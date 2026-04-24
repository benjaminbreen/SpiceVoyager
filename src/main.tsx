import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installTestMode } from './test/testMode.ts';
import './index.css';

installTestMode();

createRoot(document.getElementById('root')!).render(<App />);
