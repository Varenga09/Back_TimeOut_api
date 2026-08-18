const getPagination = ({ page = 1, limit = 10 } = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const offset = (currentPage - 1) * perPage;

  return {
    page: currentPage,
    limit: perPage,
    offset,
  };
};

const buildPaginationMeta = ({ count, page, limit }) => ({
  total: count,
  page,
  limit,
  totalPages: Math.ceil(count / limit),
});

module.exports = { getPagination, buildPaginationMeta };
