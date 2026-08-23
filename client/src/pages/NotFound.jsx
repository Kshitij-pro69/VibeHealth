import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';

export const NotFound = () => {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4 text-center">
      <div className="space-y-4 max-w-md">
        <h1 className="text-6xl font-extrabold text-teal-600">404</h1>
        <h2 className="text-2xl font-bold text-slate-800">Page Not Found</h2>
        <p className="text-sm text-slate-500">
          The healthcare resource or portal view you requested does not exist.
        </p>
        <Link to="/">
          <Button variant="primary">Return to Home</Button>
        </Link>
      </div>
    </div>
  );
};
