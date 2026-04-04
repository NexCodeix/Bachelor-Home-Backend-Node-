import { Gender, Role, User } from '@prisma/client';

export class UserEntity {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  profileImageUrl: string | null;
  gender: Gender;
  referralCode: string | null;
  role: Role;
  isSocial: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  googleId: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.fullName = user.fullName;
    this.phoneNumber = user.phoneNumber;
    this.email = user.email;
    this.profileImageUrl = user.profileImageUrl;
    this.gender = user.gender;
    this.referralCode = user.referralCode;
    this.role = user.role;
    this.isSocial = user.isSocial;
    this.isPhoneVerified = user.isPhoneVerified;
    this.isActive = user.isActive;
    this.googleId = user.googleId;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
