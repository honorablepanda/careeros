const fs = require('fs');
const path = require('path');

const schemaPath = path.join('prisma', 'schema.prisma');
const backupPath = path.join('prisma', 'schema.prisma.bak');

let s = fs.readFileSync(schemaPath, 'utf8');

// backup once per run (overwrite ok)
fs.writeFileSync(backupPath, s, 'utf8');

const hasEnum = /enum\s+ApplicationActivityType\s*\{[\s\S]*?\}/m.test(s);
const hasModel = /model\s+ApplicationActivity\s*\{[\s\S]*?\}/m.test(s);

// Insert enum before first model if missing
if (!hasEnum) {
  s = s.replace(
    /(\n\s*model\s+)/,
    `
enum ApplicationActivityType {
  CREATE
  STATUS_CHANGE
}

$1`
  );
}

// Insert model at end if missing
if (!hasModel) {
  s =
    s.trimEnd() +
    `

model ApplicationActivity {
  id            String                   @id @default(cuid())
  applicationId String
  application   Application              @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  type          ApplicationActivityType
  payload       Json?
  createdAt     DateTime                 @default(now())

  @@index([applicationId, createdAt(sort: Desc)])
}
`;
}

fs.writeFileSync(schemaPath, s, 'utf8');
console.log(
  '✓ Prisma schema patched (ApplicationActivity + enum). Backup at prisma/schema.prisma.bak'
);
