import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'

// "საიტის კონტენტი" არის სინგლტონი — მხოლოდ ერთი დოკუმენტი უნდა არსებობდეს,
// რადგან საიტი მას `*[_type == "siteContent"][0]`-ით კითხულობს. ID მიბმულია
// უკვე არსებულ დოკუმენტზე, რომ შიგთავსი არ დაიკარგოს.
const SITE_CONTENT_TYPE = 'siteContent'
const SITE_CONTENT_ID = 'a1a07fb9-44b7-4b82-b79e-9d89529106a1'

export default defineConfig({
  name: 'default',
  title: 'ქუთაისის სახარების რწმენის ეკლესია',

  projectId: 'f9j6xr69',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: S =>
        S.list()
          .title('კონტენტი')
          .items([
            S.listItem()
              .title('საიტის კონტენტი')
              .id('siteContentSingleton')
              .child(
                S.document()
                  .schemaType(SITE_CONTENT_TYPE)
                  .documentId(SITE_CONTENT_ID)
                  .title('საიტის კონტენტი')
              ),
            S.divider(),
            S.documentTypeListItem('sermonSeries').title('ქადაგებების სერიები'),
            S.documentTypeListItem('registrationEvent').title('ღონისძიებები'),
            S.documentTypeListItem('familyGroup').title('საოჯახო ჯგუფები'),
            S.documentTypeListItem('teamMember').title('მსახურთა გუნდი'),
          ]),
    }),
  ],

  schema: {
    types: schemaTypes,
    // სინგლტონისთვის "შექმნა" ღილაკი არ გვჭირდება.
    templates: templates => templates.filter(t => t.schemaType !== SITE_CONTENT_TYPE),
  },

  document: {
    // სინგლტონი ვერ წაიშლება და ვერ დუბლირდება.
    actions: (input, context) =>
      context.schemaType === SITE_CONTENT_TYPE
        ? input.filter(({action}) =>
            ['publish', 'discardChanges', 'restore'].includes(action)
          )
        : input,
  },
})
