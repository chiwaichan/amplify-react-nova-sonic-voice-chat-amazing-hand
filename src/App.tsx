import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './App.css'
import { VoiceChat } from './components/VoiceChat'

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div className="app-container">
          <main className="app-main">
            <VoiceChat signOut={signOut} userLogin={user?.signInDetails?.loginId} />
          </main>
        </div>
      )}
    </Authenticator>
  )
}

export default App
