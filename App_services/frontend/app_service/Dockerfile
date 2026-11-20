# Targets: dev (Vite dev server), prod (static build served by unprivileged nginx). Both listen on 8080.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-package-lock --no-audit --no-fund

FROM deps AS dev
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080", "--strictPort"]

FROM deps AS build
ARG VITE_API_URL=http://localhost:8010
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080