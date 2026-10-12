import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // 1. Added register method to match controller
  async register(data: { username: string; password: string; email: string }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.usersService.createUser(data.username, hashedPassword, data.email);
  }

  async validateUser(username: string, pass: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) return null;

    const valid = await bcrypt.compare(pass, user.password);
    // Fix: Match database schema field `user_id` instead of `user.id`
    if (valid) return { user_id: user.user_id, username: user.username, user_role: user.user_role };
    return null;
  }

  async login(user: { user_id: number; username: string; user_role: string }) {
    const payload = { sub: user.user_id, username: user.username, role: user.user_role };

    const accessToken = await this.jwtService.signAsync(payload);
    
    // Using JwtService for refresh tokens too
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_TOKEN_SECRET || 'refresh_secret',
      expiresIn: '7d',
    });

    await this.usersService.setRefreshToken(user.user_id, refreshToken);

    return { accessToken, refreshToken };
  }

  async logout(userId: number) {
    await this.usersService.setRefreshToken(userId, null);
    return { ok: true };
  }

  async refreshTokens(refreshToken: string) {
    try {
      // Decode and verify refresh token using NestJS JwtService
      const decoded = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET || 'refresh_secret',
      });

      const user = await this.usersService.findById(decoded.sub);
      if (!user) throw new UnauthorizedException('User not found');

      // Verify stored refresh token
      const found = await this.usersService.findByRefreshToken(refreshToken);
      if (!found) throw new UnauthorizedException('Invalid or expired refresh token');

      // Issue new token pair
      const payload = { sub: user.user_id, username: user.username, role: user.user_role };
      const newAccessToken = await this.jwtService.signAsync(payload);
      const newRefreshToken = await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET || 'refresh_secret',
        expiresIn: '7d',
      });

      await this.usersService.setRefreshToken(user.user_id, newRefreshToken);

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
      throw new UnauthorizedException('Could not refresh tokens');
    }
  }
}