FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .

# Build-time environment variables
ARG VITE_APP_PASSWORD
ENV VITE_APP_PASSWORD=$VITE_APP_PASSWORD

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
