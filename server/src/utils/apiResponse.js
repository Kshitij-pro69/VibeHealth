export class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      error: null,
    });
  }

  static created(res, data = null, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  static error(res, message = 'An error occurred', statusCode = 500, errorDetails = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      data: null,
      error: errorDetails || { message },
    });
  }
}
