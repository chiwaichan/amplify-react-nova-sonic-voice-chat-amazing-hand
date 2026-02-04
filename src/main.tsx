import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import './index.css'
import App from './App.tsx'
import outputs from '../amplify_outputs.json'

Amplify.configure(outputs)

// StrictMode disabled temporarily for WebSocket streaming testing
// (StrictMode causes double-render which interferes with bidirectional streams)
createRoot(document.getElementById('root')!).render(
  <App />,
)
