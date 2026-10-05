# Frontend Requirements Summary

This document summarizes the requirements and dependencies for the ShopBase frontend application.

## Package Dependencies

### Production Dependencies
- react@^19.2.8
- react-dom@^19.2.8
- react-router-dom@^7.18.4

### Development Dependencies
- @types/react@^19.2.18
- @types/react-dom@^19.2.7
- @vitejs/plugin-react@^6.1.1
- oxlint@^1.81.0
- vite@^8.3.0

## Development Requirements

### Software
- Node.js (v18 or higher recommended)
- npm (comes with Node.js) or alternative package manager (yarn, pnpm)

### Environment
- Modern web browser for development/testing
- Terminal/command line interface

## Build Requirements

To build the application for production:
1. Node.js installed
2. Run `npm install` to install dependencies
3. Run `npm run build` to generate production assets

## Deployment Requirements

### Static Hosting
The built application consists of static files only and can be deployed to:
- NGINX
- Apache
- Vercel
- Netlify
- Firebase Hosting
- Any static file hosting service (AWS S3, Google Cloud Storage, etc.)
- Traditional web servers

### Server Configuration
For client-side routing (React Router), the server must be configured to serve `index.html` for all routes:
- NGINX: `try_files $uri $uri/ /index.html;`
- Apache: Use mod_rewrite to redirect to index.html
- Most static hosting platforms handle this automatically for SPAs

### Environment Variables (if needed for API)
If connecting to a real backend, environment variables should be set:
- VITE_API_URL: Base URL for API endpoints
- Other VITE_* variables as needed

## Verification

To verify the application is working correctly:
1. Run `npm run dev` for development server
2. Run `npm run build` followed by `npm run preview` to test production build
3. Check that all pages load correctly
4. Verify routing works (direct URL access to internal pages)
5. Test responsive design across device sizes

## Maintenance

### Updating Dependencies
```bash
# Update to latest versions
npm update

# Or check for outdated packages
npm outdated
```

### Rebuilding
After making changes:
```bash
npm run build
```

Deploy the contents of the `dist` directory to your hosting provider.