const successResponse = (
  res,
  data = {},
  message = 'Operação realizada com sucesso',
  statusCode = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (
  res,
  message = 'Ocorreu um erro',
  statusCode = 400,
  error = {}
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: error || {},
  });
};

module.exports = { successResponse, errorResponse };
