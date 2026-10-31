const parsePaging = (query = {}) => {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let pageSize = parseInt(query.pageSize, 10);
  if (isNaN(pageSize) || pageSize < 1) {
    pageSize = 20;
  } else if (pageSize > 100) {
    pageSize = 100;
  }

  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  return { page, pageSize, limit, offset };
};

const pageResult = (data, page, pageSize, total) => {
  return {
    data,
    page,
    pageSize,
    total: typeof total === 'string' ? parseInt(total, 10) : total,
  };
};

module.exports = {
  parsePaging,
  pageResult,
};
