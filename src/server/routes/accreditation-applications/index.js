import { auditRecordView } from '#/server/common/helpers/audit.js'
import { getLegacyAccreditationApplication } from '#/server/common/helpers/backend-api/backend-api.js'
import { maskPersonalData } from '#/server/common/helpers/mask-personal-data.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { RECORD_PATH } from '#/server/common/helpers/legacy-application.js'
import { documentLines } from '#/server/common/helpers/document-lines.js'
import { coreDetails, recordTitle, referenceParam } from './record.js'

const VIEW_AUDIT = 'view-legacy-accreditation-application'
const searchCrumb = { text: 'Search', href: '/search' }

// AC04: a reference no application has, or one that couldn't be one.
function notFound(h, reference) {
  return h
    .view('accreditation-applications/not-found', {
      pageTitle: 'Accreditation application not found',
      reference,
      breadcrumbs: [searchCrumb, { text: 'Not found' }]
    })
    .code(statusCodes.notFound)
}

export const accreditationApplications = {
  plugin: {
    name: 'accreditation-applications',
    register(server) {
      server.route({
        method: 'GET',
        path: `${RECORD_PATH}/{reference}`,
        options: {
          validate: {
            params: referenceParam,
            failAction(request, h) {
              return notFound(h, request.params.reference).takeover()
            }
          }
        },
        async handler(request, h) {
          const { reference } = request.params
          const user = request.auth.credentials.user
          const result = await getLegacyAccreditationApplication(
            reference,
            request.logger
          )

          if (result.notFound) {
            auditRecordView(VIEW_AUDIT, user, { reference }, 'not-found')
            return notFound(h, reference)
          }
          auditRecordView(
            VIEW_AUDIT,
            user,
            { reference },
            result.ok ? 'found' : 'unavailable'
          )

          if (!result.ok) {
            return h.view('accreditation-applications/record', {
              pageTitle: reference,
              heading: reference,
              breadcrumbs: [searchCrumb, { text: reference }],
              unavailable: true
            })
          }

          // Masked here, before anything reaches the view (AGENTS.md).
          const document = maskPersonalData(result.application)
          const title = recordTitle(document)
          return h
            .view('accreditation-applications/record', {
              pageTitle: title,
              heading: title,
              breadcrumbs: [searchCrumb, { text: title }],
              details: coreDetails(document),
              lines: documentLines(document)
            })
            .header('cache-control', 'no-store')
        }
      })
    }
  }
}
