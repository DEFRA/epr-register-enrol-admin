import { config } from '#/config/config.js'

export const homeController = {
  handler(_request, h) {
    return h.view('home/index', {
      pageTitle: 'Home',
      heading: config.get('serviceName')
    })
  }
}
