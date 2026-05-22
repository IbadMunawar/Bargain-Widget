import './index.css'
import ReactDOM from 'react-dom/client'
import { ChatWidget, type WidgetConfig } from './components/ChatWidget'
window.initBargainWidget = function (config: WidgetConfig) {
  // Find or create the mount container
  let container = document.getElementById('bargain-baas-root')
  if (!container) {
    container = document.createElement('div')
    container.id = 'bargain-baas-root'
    document.body.appendChild(container)
  }

  ReactDOM.createRoot(container).render(<ChatWidget config={config} />)
}
