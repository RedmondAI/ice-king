import './styles.css';
import { bootstrapApp } from './app/bootstrap';

const container = document.getElementById('app');
if (!container) {
  throw new Error('App root #app is missing.');
}

bootstrapApp(container);
