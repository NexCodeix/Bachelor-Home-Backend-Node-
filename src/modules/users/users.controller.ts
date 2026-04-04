import {
  BadRequestException,
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ERROR_CODES } from '../../common/constants/error-codes';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UsersService } from './users.service';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';

const profilesUploadDestination = join(process.cwd(), 'uploads', 'profiles');

const profileStorage = diskStorage({
  destination: (_request, _file, callback) => {
    mkdirSync(profilesUploadDestination, { recursive: true });
    callback(null, profilesUploadDestination);
  },
  filename: (_request, file, callback) => {
    const extension = extname(file.originalname) || '.jpg';
    const safeBaseName =
      file.originalname
        .replace(extension, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'profile';

    callback(null, `${safeBaseName}-${Date.now()}${extension.toLowerCase()}`);
  },
});

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMyProfile(user);
  }

  @Patch('me')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: profileStorage,
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: 'profileImage must be an image file',
            }),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .addFileTypeValidator({ fileType: /^image\// })
        .build({ fileIsRequired: false }),
    )
    profileImage?: Express.Multer.File,
  ) {
    return this.usersService.updateMyProfile(user, updateUserDto, profileImage);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: AdminUpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.remove(id);
  }
}
