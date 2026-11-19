export const search = {
  plugin: {
    name: 'search',
    register(server) {
      server.route({
        method: 'GET',
        path: '/search',
        handler(_request, h) {
          return h.view('search/index', { pageTitle: 'Search' })
        }
      })
    }
  }
}
