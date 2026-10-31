// 歌单详情
// 可选参数 n: 返回的完整歌曲数量(默认 100000)，s: 最近收藏者数量(默认 8)。
// trackIds 始终完整，客户端可按需用 /song/detail 分页取歌曲详情。

const createOption = require('../util/option.js')
module.exports = (query, request) => {
  const data = {
    id: query.id,
    n: query.n !== undefined ? parseInt(query.n) : 100000,
    s: query.s !== undefined ? parseInt(query.s) : 8,
  }
  return request(`/api/v6/playlist/detail`, data, createOption(query))
}
