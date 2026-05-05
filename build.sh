#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Project configuration
# Replace with your actual GCP project ID or set it manually before running
PROJECT_ID="bjhpyh1"
REGION="us-central1"
SERVICE_NAME="cainiao1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo ">>> Building Docker image: ${IMAGE_NAME}..."
# Uncomment and supply your build args if needed (e.g. for frontend use)
# docker build --build-arg VITE_APP_PASSWORD="your_password" -t ${IMAGE_NAME} .
docker build -t ${IMAGE_NAME} .

echo ">>> Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}

echo ">>> Deploying to Google Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars="VITE_APP_PASSWORD=your_password,TURSO_DATABASE_URL=your_turso_db_url,TURSO_AUTH_TOKEN=your_turso_auth_token"

echo ">>> Deployment complete!"
