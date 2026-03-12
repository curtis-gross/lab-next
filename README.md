# AI Lab - Full Stack Application

This is a comprehensive full-stack AI lab application built with React, Node.js, and Google Cloud Vertex AI. Follow the guide below to set up your environment and run the application locally or deploy it to Google Cloud Run.

Note - when first using the application be sure to run marketing brief, audience generator and then the synthetif focus groups use that data for their answers.

## Prerequisites

Before starting, ensure you have the following installed on your machine (Mac or Windows):

1.  **Node.js & npm**: Install the latest LTS version of Node.js from [nodejs.org](https://nodejs.org/). This will include `npm`.
2.  **Google Cloud CLI (gcloud)**: Install the `gcloud` CLI to interact with Google Cloud services.
    -   **Mac**: `brew install --cask google-cloud-sdk` (or download from the Google Cloud docs).
    -   **Windows**: Download the installer from the Google Cloud CLI documentation.

---

## 1. Google Cloud Environment Setup

To use the AI features in this application, you need a Google Cloud Project with the Vertex AI API enabled and proper authentication configured on your local machine.

### Step 1: Create a Google Cloud Project
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project (or select an existing one).
3.  Note your **Project ID**.

### Step 2: Enable the Vertex AI API
1.  In the Google Cloud Console, navigate to **APIs & Services > Library**.
2.  Search for **Vertex AI API** and click **Enable**.

### Step 3: Authenticate Locally
Open your terminal (Command Prompt/PowerShell on Windows, Terminal on Mac) and authenticate the `gcloud` CLI:

```bash
# Log in to your Google Cloud account
gcloud auth login

# Set your active project
gcloud config set project YOUR_PROJECT_ID

# Set up Application Default Credentials (ADC)
# This is required for the local Node.js server to call Vertex AI!
gcloud auth application-default login
```
*Note: The command `gcloud auth application-default login` will open a browser window for you to authenticate and will generate a local credentials file that the Google Cloud SDKs use automatically.*

---

## 2. Local Application Setup

Once your cloud environment is ready, set up the project locally.

### Step 1: Install Dependencies
Navigate to the root of your project directory and install the required npm packages:

```bash
cd lab-next
npm install
```

### Step 2: Verify Configuration
If you copied this from a template, ensure you update any specific configurations:
-   Edit `package.json` if you need to update the `"name"` field.
-   Edit `cloud_run.sh` to update the `SERVICE_NAME` variable if you plan to deploy.

---

## 3. Running the Application Locally

You can start the development server using the provided bash script or standard npm commands.

### Option A: Using the Start Script (Recommended for Mac/Linux)
```bash
./start_local.sh
```

### Option B: Using npm Directly (Windows or Mac)
```bash
npm run dev
```

The application should now be accessible in your browser at `http://localhost:5173` (or the port specified in your console output).

---

## 4. Deployment to Google Cloud Run

To deploy the application to the internet using Google Cloud Run, follow these steps:

### Step 1: Upload Secrets (One-time Setup)
If your application requires specific API keys (like a Gemini API key for the frontend widget), run the setup script to upload it to Google Cloud Secret Manager:

```bash
./setup_api_key.sh
```
*You will be prompted to enter your API key, which will be securely stored.*

### Step 2: Deploy to Cloud Run
Run the deployment script to build the Docker container and deploy it to Cloud Run:

```bash
./cloud_run.sh
```

Upon successful deployment, the CLI will output a public URL where your application is hosted.