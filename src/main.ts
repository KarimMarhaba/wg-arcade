import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/space-grotesk';
import './ui/tokens.css';
import './ui/base.css';
import './ui/components.css';
import './ui/motion.css';
import './ui/games.css';
import { startApp } from './app';

startApp(document.getElementById('app') as HTMLElement);
