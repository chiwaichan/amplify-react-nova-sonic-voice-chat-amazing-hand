# Amazon Nova 2 Sonic Voice Chat

A serverless **React** voice chat application powered by **Amazon Nova 2 Sonic** on AWS Bedrock, built with **AWS Amplify Gen 2**.

- **Amazon Nova 2 Sonic** - Speech-to-speech foundation model for real-time, natural voice conversations
- **AWS Amplify Gen 2** - Serverless backend with infrastructure-as-code using TypeScript
- **React** - Frontend UI with Vite for fast development
- **Amazon Cognito** - User authentication and authorization

## Prerequisites

- Node.js 18.x or later
- AWS Account
- AWS CLI installed and configured with credentials (`aws configure`)

## Setup

### 1. Enable Amazon Nova 2 Sonic model access

Before using this app, you need to enable access to the Nova 2 Sonic model in Amazon Bedrock:

1. Go to the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/)
2. Select **us-east-1** (N. Virginia) region
3. Navigate to **Model access** in the left sidebar
4. Click **Modify model access**
5. Enable **Amazon Nova 2 Sonic**
6. Click **Save changes**

### 2. Install dependencies

```bash
npm install
```

### 3. Start the Amplify sandbox

This creates a personal cloud sandbox environment with your auth backend:

```bash
npm run sandbox
```

The sandbox will:
- Deploy a Cognito User Pool for authentication
- Deploy a Cognito Identity Pool with permissions for Bedrock
- Generate the `amplify_outputs.json` configuration file
- Watch for changes to your backend code

Keep this terminal running.

### 4. Start the development server

In a new terminal:

```bash
npm run dev
```

### 5. Open the app

Navigate to `http://localhost:5173` in your browser. Create an account and sign in to start using voice chat.

## Project Structure

```
├── amplify/
│   ├── auth/
│   │   └── resource.ts      # Cognito auth configuration
│   ├── backend.ts           # Main backend definition
│   └── tsconfig.json        # Backend TypeScript config
├── src/
│   ├── App.tsx              # Main app with Authenticator
│   ├── main.tsx             # Entry point with Amplify config
│   └── ...
├── amplify_outputs.json     # Generated Amplify config (git-ignored)
└── package.json
```

## Available Scripts

- `npm run dev` - Start the Vite development server
- `npm run build` - Build for production
- `npm run sandbox` - Start Amplify sandbox environment
- `npm run sandbox:delete` - Delete the sandbox environment

## Deploying to Production

To deploy your app to AWS Amplify Hosting:

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Go to the AWS Amplify Console
3. Connect your repository
4. Amplify will automatically detect the Gen 2 backend and deploy

## Learn More

- [AWS Amplify Gen 2 Documentation](https://docs.amplify.aws/gen2/)
- [Amplify UI React Components](https://ui.docs.amplify.aws/react)
- [Vite Documentation](https://vitejs.dev/)
