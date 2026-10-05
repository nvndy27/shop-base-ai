# Deployment Instructions for ShopBase Frontend

This document provides instructions for building and deploying the ShopBase frontend application.

## Overview

The frontend is a React 19 application built with Vite. It consists of static assets (HTML, CSS, JavaScript) that can be served by any static web server.

## Prerequisites

- Node.js (version 18 or higher recommended)
- npm or yarn package manager

## Installation

To install dependencies:

```bash
npm install
```

## Building for Production

To build the application for production:

```bash
npm run build
```

This will generate optimized static files in the `dist` directory.

## Previewing Production Build Locally

To preview the production build locally:

```bash
npm run preview
```

This will start a local server serving the contents of the `dist` directory.

## Deployment Options

### Option 1: Using npx serve (Quick Test)

For quick testing or small-scale deployment:

```bash
npx serve -s dist
```

### Option 2: Using NGINX

1. Copy the contents of the `dist` directory to your NGINX web root (e.g., `/var/www/html`)
2. Configure NGINX to serve the static files:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Option 3: Using Apache

1. Copy the contents of the `dist` directory to your Apache web root
2. Ensure mod_rewrite is enabled and configure .htaccess:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Option 4: Using Vercel

1. Push your code to a Git repository
2. Import the project in Vercel
3. Vercel will automatically detect it's a Vite project and configure the build settings
4. Set the build command to: `npm run build`
5. Set the output directory to: `dist`

### Option 5: Using Netlify

1. Push your code to a Git repository
2. Connect the repository to Netlify
3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy

### Option 6: Using Firebase Hosting

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Initialize Firebase project: `firebase init`
3. When prompted, choose Hosting and configure:
   - Public directory: `dist`
   - Configure as single-page app: Yes
4. Deploy: `firebase deploy`

## Environment Variables

The application uses Vite's environment variable prefixing. Variables must be prefixed with `VITE_` to be accessible in the client-side code.

Example `.env.production` file:
```
VITE_API_URL=https://api.example.com
VITE_APP_NAME=ShopBase
```

These variables are baked into the build at compile time.

## Important Notes

1. **No Node.js Server Required in Production**: The built application consists of static files only and does not require a Node.js server to run in production.

2. **Client-Side Routing**: Since this is a single-page application using React Router, your web server must be configured to serve `index.html` for all client-side routes (as shown in the NGINX and Apache examples above).

3. **API Endpoints**: The application currently uses mock data for API interactions. In production, you'll need to configure the appropriate API endpoints via environment variables or modify the mock data calls to point to your actual backend.

4. **Performance Optimization**: The production build includes:
   - Minified JavaScript and CSS
   - Code splitting
   - Asset hashing for cache busting
   - Optimized React bundles

## Troubleshooting

### Blank Page After Deployment
- Ensure your server is correctly configured to serve `index.html` for all routes
- Check browser console for JavaScript errors
- Verify that the build output was copied completely to your server

### 404 Errors on Refresh
- This indicates your server is not configured for client-side routing
- Make sure to add the fallback rule to serve `index.html` for unknown routes

### Missing Assets
- Verify that the build process completed successfully
- Check that all files in the `dist` directory were deployed
- Ensure your server has proper read permissions for the deployed files

## Maintenance

To update the deployment:

1. Pull latest code from repository
2. Run `npm install` if dependencies changed
3. Run `npm run build` to create a new production build
4. Replace the contents of your web server's public directory with the new `dist` contents
5. Restart your web server if necessary

For zero-downtime deployments, consider using a blue/green deployment strategy or your hosting provider's built-in deployment features.