import {
  Absence,
  ActivityLog,
  Break,
  CorrectionRequest,
  HiddenUsername,
  Pointage,
  ScheduledEmailJobRecipient,
  Session,
  User,
} from 'src/generated/prisma/client';
import { encrypt, decrypt } from './crypto';
import type {
  UserCreateInput,
  PointageCreateInput,
  BreakCreateInput,
  AbsenceCreateInput,
  CorrectionRequestCreateInput,
  ActivityLogCreateInput,
  SessionCreateInput,
  HiddenUsernameCreateInput,
  ScheduledEmailJobRecipientCreateInput,
} from 'src/generated/prisma/models';

export function encryptUser(
  data: Partial<UserCreateInput>,
): Partial<UserCreateInput> {
  const encrypted = { ...data };

  if (encrypted.email && typeof encrypted.email === 'string') {
    encrypted.email = encrypt(encrypted.email.toLowerCase().trim());
  }
  if (encrypted.username && typeof encrypted.username === 'string') {
    encrypted.username = encrypt(encrypted.username.toLowerCase().trim());
  }
  if (encrypted.firstname && typeof encrypted.firstname === 'string') {
    encrypted.firstname = encrypt(encrypted.firstname);
  }
  if (encrypted.lastname && typeof encrypted.lastname === 'string') {
    encrypted.lastname = encrypt(encrypted.lastname);
  }
  if (encrypted.department && typeof encrypted.department === 'string') {
    encrypted.department = encrypt(encrypted.department);
  }
  if (encrypted.position && typeof encrypted.position === 'string') {
    encrypted.position = encrypt(encrypted.position);
  }

  return encrypted;
}

export function decryptUser(data: Partial<User> | User): User {
  const decrypted = { ...data } as User;

  if (decrypted.email && typeof decrypted.email === 'string') {
    decrypted.email = decrypt(decrypted.email);
  }
  if (decrypted.username && typeof decrypted.username === 'string') {
    decrypted.username = decrypt(decrypted.username);
  }
  if (decrypted.firstname && typeof decrypted.firstname === 'string') {
    decrypted.firstname = decrypt(decrypted.firstname);
  }
  if (decrypted.lastname && typeof decrypted.lastname === 'string') {
    decrypted.lastname = decrypt(decrypted.lastname);
  }
  if (decrypted.department && typeof decrypted.department === 'string') {
    decrypted.department = decrypt(decrypted.department);
  }
  if (decrypted.position && typeof decrypted.position === 'string') {
    decrypted.position = decrypt(decrypted.position);
  }

  return decrypted;
}

export function encryptPointage(
  data: Partial<PointageCreateInput>,
): Partial<PointageCreateInput> {
  const encrypted = { ...data };

  if (encrypted.entryTime && typeof encrypted.entryTime === 'string') {
    encrypted.entryTime = encrypt(encrypted.entryTime);
  }
  if (encrypted.exitTime && typeof encrypted.exitTime === 'string') {
    encrypted.exitTime = encrypt(encrypted.exitTime);
  }
  if (encrypted.lateReason && typeof encrypted.lateReason === 'string') {
    encrypted.lateReason = encrypt(encrypted.lateReason);
  }
  if (
    encrypted.earlyExitReason &&
    typeof encrypted.earlyExitReason === 'string'
  ) {
    encrypted.earlyExitReason = encrypt(encrypted.earlyExitReason);
  }

  return encrypted;
}

export function decryptPointage(data: Partial<Pointage> | Pointage): Pointage {
  const decrypted = { ...data } as Pointage;

  if (decrypted.entryTime) decrypted.entryTime = decrypt(decrypted.entryTime);
  if (decrypted.exitTime) decrypted.exitTime = decrypt(decrypted.exitTime);
  if (decrypted.lateReason)
    decrypted.lateReason = decrypt(decrypted.lateReason);
  if (decrypted.earlyExitReason)
    decrypted.earlyExitReason = decrypt(decrypted.earlyExitReason);

  return decrypted;
}

export function encryptBreak(
  data: Partial<BreakCreateInput>,
): Partial<BreakCreateInput> {
  const encrypted = { ...data };

  if (encrypted.startTime && typeof encrypted.startTime === 'string') {
    encrypted.startTime = encrypt(encrypted.startTime);
  }
  if (encrypted.endTime && typeof encrypted.endTime === 'string') {
    encrypted.endTime = encrypt(encrypted.endTime);
  }

  return encrypted;
}

export function decryptBreak(data: Partial<Break> | Break): Break {
  const decrypted = { ...data } as Break;

  if (decrypted.startTime) decrypted.startTime = decrypt(decrypted.startTime);
  if (decrypted.endTime) decrypted.endTime = decrypt(decrypted.endTime);

  return decrypted;
}

export function encryptAbsence(
  data: Partial<AbsenceCreateInput>,
): Partial<AbsenceCreateInput> {
  const encrypted = { ...data };

  if (encrypted.reason && typeof encrypted.reason === 'string') {
    encrypted.reason = encrypt(encrypted.reason);
  }
  if (encrypted.comment && typeof encrypted.comment === 'string') {
    encrypted.comment = encrypt(encrypted.comment);
  }

  return encrypted;
}

export function decryptAbsence(data: Partial<Absence> | Absence): Absence {
  const decrypted = { ...data } as Absence;

  if (decrypted.reason) decrypted.reason = decrypt(decrypted.reason);
  if (decrypted.comment) decrypted.comment = decrypt(decrypted.comment);

  return decrypted;
}

export function encryptCorrectionRequest(
  data: Partial<CorrectionRequestCreateInput>,
): Partial<CorrectionRequestCreateInput> {
  const encrypted = { ...data };

  if (encrypted.originalEntry && typeof encrypted.originalEntry === 'string') {
    encrypted.originalEntry = encrypt(encrypted.originalEntry);
  }
  if (encrypted.originalExit && typeof encrypted.originalExit === 'string') {
    encrypted.originalExit = encrypt(encrypted.originalExit);
  }
  if (encrypted.newEntry && typeof encrypted.newEntry === 'string') {
    encrypted.newEntry = encrypt(encrypted.newEntry);
  }
  if (encrypted.newExit && typeof encrypted.newExit === 'string') {
    encrypted.newExit = encrypt(encrypted.newExit);
  }
  if (encrypted.reason && typeof encrypted.reason === 'string') {
    encrypted.reason = encrypt(encrypted.reason);
  }

  return encrypted;
}

export function decryptCorrectionRequest(
  data: CorrectionRequest,
): CorrectionRequest {
  const decrypted = { ...data };

  if (decrypted.originalEntry)
    decrypted.originalEntry = decrypt(decrypted.originalEntry);
  if (decrypted.originalExit)
    decrypted.originalExit = decrypt(decrypted.originalExit);
  if (decrypted.newEntry) decrypted.newEntry = decrypt(decrypted.newEntry);
  if (decrypted.newExit) decrypted.newExit = decrypt(decrypted.newExit);
  if (decrypted.reason) decrypted.reason = decrypt(decrypted.reason);

  return decrypted;
}

export function encryptActivityLog(
  data: Partial<ActivityLogCreateInput>,
): Partial<ActivityLogCreateInput> {
  const encrypted = { ...data };

  if (encrypted.action && typeof encrypted.action === 'string') {
    encrypted.action = encrypt(encrypted.action);
  }
  if (encrypted.details && typeof encrypted.details === 'string') {
    encrypted.details = encrypt(encrypted.details);
  }

  return encrypted;
}

export function decryptActivityLog(data: ActivityLog): ActivityLog {
  const decrypted = { ...data };

  if (decrypted.action) decrypted.action = decrypt(decrypted.action);
  if (decrypted.details) decrypted.details = decrypt(decrypted.details);

  return decrypted;
}

export function encryptSession(
  data: Partial<SessionCreateInput>,
): Partial<SessionCreateInput> {
  const encrypted = { ...data };

  if (encrypted.sessionToken && typeof encrypted.sessionToken === 'string') {
    encrypted.sessionToken = encrypt(encrypted.sessionToken);
  }
  if (encrypted.ipAddress && typeof encrypted.ipAddress === 'string') {
    encrypted.ipAddress = encrypt(encrypted.ipAddress);
  }
  if (encrypted.userAgent && typeof encrypted.userAgent === 'string') {
    encrypted.userAgent = encrypt(encrypted.userAgent);
  }

  return encrypted;
}

export function decryptSession(data: Session): Session {
  const decrypted = { ...data };

  if (decrypted.sessionToken)
    decrypted.sessionToken = decrypt(decrypted.sessionToken);
  if (decrypted.ipAddress) decrypted.ipAddress = decrypt(decrypted.ipAddress);
  if (decrypted.userAgent) decrypted.userAgent = decrypt(decrypted.userAgent);

  return decrypted;
}

export function encryptHiddenUsername(
  data: Partial<HiddenUsernameCreateInput>,
): Partial<HiddenUsernameCreateInput> {
  const encrypted = { ...data };

  if (encrypted.username && typeof encrypted.username === 'string') {
    encrypted.username = encrypt(encrypted.username);
  }

  return encrypted;
}

export function decryptHiddenUsername(data: HiddenUsername): HiddenUsername {
  const decrypted = { ...data };

  if (decrypted.username) decrypted.username = decrypt(decrypted.username);

  return decrypted;
}

export function encryptScheduledEmailJobRecipient(
  data: Partial<ScheduledEmailJobRecipientCreateInput>,
): Partial<ScheduledEmailJobRecipientCreateInput> {
  const encrypted = { ...data };

  if (encrypted.email && typeof encrypted.email === 'string') {
    encrypted.email = encrypt(encrypted.email);
  }

  return encrypted;
}

export function decryptScheduledEmailJobRecipient(
  data: ScheduledEmailJobRecipient,
): ScheduledEmailJobRecipient {
  const decrypted = { ...data };

  if (decrypted.email) decrypted.email = decrypt(decrypted.email);

  return decrypted;
}
