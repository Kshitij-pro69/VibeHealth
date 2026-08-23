import { ApiResponse } from '../utils/apiResponse.js';

export const validateRequest = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const parsed = await schema.parseAsync(dataToValidate);
      req[source] = parsed;
      next();
    } catch (error) {
      if (error.name === 'ZodError') {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return ApiResponse.error(res, 'Validation failed for request data', 400, {
          validationErrors: formattedErrors,
        });
      }
      next(error);
    }
  };
};
