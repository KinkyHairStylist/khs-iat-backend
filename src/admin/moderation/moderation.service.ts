import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  FlaggedContent, 
  ReportType,
  ReporterType,
  ReportSeverity,
  ReportStatus,
 } from './entities/flagged-content.entity';
import { ModerationSettings } from './entities/moderation-settings.entity';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(FlaggedContent)
    private readonly flaggedRepo: Repository<FlaggedContent>,
    @InjectRepository(ModerationSettings)
    private readonly settingsRepo: Repository<ModerationSettings>,
  ) {}

  // get summary
  async getReportStats() {
    const total = await this.flaggedRepo.count();
    const pending = await this.flaggedRepo.count({ where: { status: ReportStatus.PENDING } });
    const approved = await this.flaggedRepo.count({ where: { status: ReportStatus.APPROVED } });
    const rejected = await this.flaggedRepo.count({ where: { status: ReportStatus.REJECTED } });

    return {
      total,
      pending,
      approved,
      rejected,
    };
  }

  // Get all flagged content
  async getFlaggedContent() {
    const records = await this.flaggedRepo.find({
      relations: ['reporter', 'reported'],
      order: { createdAt: 'DESC' },
    });

    return records.map((record) => ({
      id: record.id,
      ref: record.ref,
      type: record.type,
      preview: record.preview,
      reporter:
        record.reporter
          ? `${record.reporter.firstName ?? ''} ${record.reporter.surname ?? ''}`.trim() ||
            record.reporter.email
          : null,
      reported:
        record.reported
          ? `${record.reported.firstName ?? ''} ${record.reported.surname ?? ''}`.trim() ||
            record.reported.email
          : 'No Name',
      reporterType: record.reporterType,
      reason: record.reason,
      severity: record.severity,
      status: record.status,
      createdAt: record.createdAt,
    }));
  }


  // 2️⃣ Get all user reviews (flagged type = Review)
  async getAllUserReviews() {
    return this.flaggedRepo.find({
      where: { type: ReportType.REVIEW },
      order: { createdAt: 'DESC' },
      relations: ['reported', 'reporter'],
    });
  }

   //  Create new reported content (review/profile/business)
  async createReport(data: Partial<FlaggedContent>): Promise<FlaggedContent> {
    const report = this.flaggedRepo.create({
      ...data,
      status: ReportStatus.PENDING,
      reporterType: data.reporterType || ReporterType.ADMIN_SYSTEM,
      severity: data.severity || ReportSeverity.LOW,
    });

    return this.flaggedRepo.save(report);
  }


  // 3️⃣ Approve review
  async approveReview(id: string) {
    const review = await this.flaggedRepo.findOne({ where: { id } });

    if (!review) throw new NotFoundException('Report not found');

    review.status = ReportStatus.APPROVED;
    return this.flaggedRepo.save(review);
  }
  // 4️⃣ Reject review
  async rejectReview(id: string) {
    const review = await this.flaggedRepo.findOne({ where: { id } });

    if (!review) throw new NotFoundException('Report not found');

    review.status = ReportStatus.REJECTED;
    return this.flaggedRepo.save(review);
  }

  // 5️⃣ Remove inappropriate content
  async removeInappropriateContent(id: string) {
    const content = await this.flaggedRepo.findOne({ where: { id } });
    if (!content) throw new NotFoundException('Flagged content not found');
    await this.flaggedRepo.remove(content);
    return;
  }

  // 6️⃣ Get moderation settings
  async getSettings() {
   let settings = await this.settingsRepo.findOne({ where: {} });

    if (!settings) {
      settings = this.settingsRepo.create({
        bannedWords: ['inappropriate', 'scam', 'fake', 'terrible'],
        Reviews:true,
        UserProfile:true,
        images: false,
      });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  // 7️⃣ Update moderation settings
  async updateSettings(updateData: Partial<ModerationSettings>) {
    let settings = await this.settingsRepo.findOne({ where: {} });;
    if (!settings) {
      settings = this.settingsRepo.create(updateData);
    } else {
      Object.assign(settings, updateData);
    }
    return this.settingsRepo.save(settings);
  }
}
