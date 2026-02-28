import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  HandState: a
    .model({
      deviceName: a.string().required(),
      gesture: a.string(),
      letter: a.string(),
      indexAngle1: a.integer(),
      indexAngle2: a.integer(),
      middleAngle1: a.integer(),
      middleAngle2: a.integer(),
      ringAngle1: a.integer(),
      ringAngle2: a.integer(),
      thumbAngle1: a.integer(),
      thumbAngle2: a.integer(),
      timestamp: a.integer().required(),
      videoUrl: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
