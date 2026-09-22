import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessStatus } from 'src/business/entities/business.entity';
import { Service } from 'src/business/entities/service.entity';
import { MerchantMembershipPackage } from 'src/business/entities/merchant-membership-package.entity';
import {
  MerchantMembershipPurchase,
  MerchantMembershipPurchaseStatus,
} from 'src/business/entities/merchant-membership-purchase.entity';
import { MerchantMembershipService } from 'src/business/services/merchant-membership.service';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { AdminCreateMerchantMembershipDto } from '../dtos/admin-merchant-membership.dto';

const RECENT_PURCHASES = 200;

// What the admin sees of the membership packages salons sell to their clients, and the ability to
// create or switch off a package for a salon. The rules are the salon's own (MerchantMembershipService),
// so a package made here is identical to one the salon made.
@Injectable()
export class AdminMerchantMembershipsService {
  constructor(
    @InjectRepository(MerchantMembershipPackage)
    private readonly packageRepo: Repository<MerchantMembershipPackage>,
    @InjectRepository(MerchantMembershipPurchase)
    private readonly purchaseRepo: Repository<MerchantMembershipPurchase>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    private readonly merchantMemberships: MerchantMembershipService,
  ) {}

  async overview() {
    const packages = await this.packageRepo.find({
      relations: ['service', 'business'],
      order: { createdAt: 'DESC' },
    });

    // Per package: how many were bought and where they stand. (An expired membership has its
    // remaining sessions zeroed when it expires, so unused sessions are only counted while active.)
    const statRows = await this.purchaseRepo
      .createQueryBuilder('p')
      .select('p.packageId', 'packageId')
      .addSelect('COUNT(*)', 'sold')
      .addSelect(`COUNT(*) FILTER (WHERE p.status = :active)`, 'active')
      .addSelect(`COUNT(*) FILTER (WHERE p.status = :used)`, 'fullyUsed')
      .addSelect(`COUNT(*) FILTER (WHERE p.status = :expired)`, 'expired')
      .addSelect(`COALESCE(SUM(p.remainingSessions) FILTER (WHERE p.status = :active), 0)`, 'sessionsLeft')
      .setParameters({
        active: MerchantMembershipPurchaseStatus.ACTIVE,
        used: MerchantMembershipPurchaseStatus.FULLY_REDEEMED,
        expired: MerchantMembershipPurchaseStatus.EXPIRED,
      })
      .groupBy('p.packageId')
      .getRawMany();
    const stats = new Map(statRows.map((r) => [r.packageId as string, r]));

    const packageRows = packages.map((pkg) => {
      const s = stats.get(pkg.id);
      const sold = Number(s?.sold ?? 0);
      const price = Number(pkg.pricePerSession);
      return {
        id: pkg.id,
        businessId: pkg.businessId,
        businessName: pkg.business?.businessName ?? 'Unknown salon',
        serviceId: pkg.serviceId,
        serviceName: pkg.service?.name ?? 'Deleted service',
        pricePerSession: price,
        sessionCount: pkg.sessionCount,
        // What a client pays for the whole package.
        clientPays: Math.round(price * pkg.sessionCount * 100) / 100,
        expiryDays: pkg.expiryDays,
        isActive: pkg.isActive,
        createdAt: pkg.createdAt,
        sold,
        activeMemberships: Number(s?.active ?? 0),
        fullyUsed: Number(s?.fullyUsed ?? 0),
        expired: Number(s?.expired ?? 0),
        sessionsLeft: Number(s?.sessionsLeft ?? 0),
        soldValue: Math.round(price * pkg.sessionCount * sold * 100) / 100,
      };
    });

    const purchases = await this.purchaseRepo.find({
      relations: ['client', 'package', 'package.service', 'package.business'],
      order: { purchasedAt: 'DESC' },
      take: RECENT_PURCHASES,
    });

    const purchaseRows = purchases.map((p) => ({
      id: p.id,
      clientName:
        `${p.client?.firstName ?? ''} ${p.client?.surname ?? ''}`.trim() || p.client?.email || 'Unknown client',
      clientEmail: p.client?.email ?? '',
      businessName: p.package?.business?.businessName ?? 'Unknown salon',
      serviceName: p.package?.service?.name ?? 'Deleted service',
      sessionCount: p.package?.sessionCount ?? 0,
      remainingSessions: p.remainingSessions,
      purchasedAt: p.purchasedAt,
      expiresAt: p.expiresAt,
      status: p.status,
    }));

    const sum = (pick: (r: (typeof packageRows)[number]) => number) =>
      packageRows.reduce((total, r) => total + pick(r), 0);

    return {
      summary: {
        packages: packageRows.length,
        activePackages: packageRows.filter((r) => r.isActive).length,
        salons: new Set(packageRows.map((r) => r.businessId)).size,
        sold: sum((r) => r.sold),
        activeMemberships: sum((r) => r.activeMemberships),
        sessionsLeft: sum((r) => r.sessionsLeft),
        soldValue: Math.round(sum((r) => r.soldValue) * 100) / 100,
      },
      packages: packageRows,
      purchases: purchaseRows,
    };
  }

  // Salons an admin can create a package for: approved ones only.
  async listSalons() {
    const businesses = await this.businessRepo.find({
      where: { status: BusinessStatus.APPROVED },
      select: { id: true, businessName: true },
      order: { businessName: 'ASC' },
    });
    return businesses.map((b) => ({ id: b.id, name: b.businessName }));
  }

  async listServices(businessId: string) {
    const services = await this.serviceRepo.find({
      where: { business: { id: businessId } },
      select: { id: true, name: true, price: true },
      order: { name: 'ASC' },
    });
    return services.map((s) => ({ id: s.id, name: s.name, price: s.price === null ? null : Number(s.price) }));
  }

  async create(dto: AdminCreateMerchantMembershipDto, createdBy?: string) {
    const business = await this.businessRepo.findOne({ where: { id: dto.businessId } });
    if (!business) throw new NotFoundException('Salon not found.');
    if (business.status !== BusinessStatus.APPROVED) {
      throw new BadRequestException('Packages can only be created for approved salons.');
    }

    // The salon's own rules apply: the service has to belong to this salon.
    const created = await this.merchantMemberships.create(
      {
        serviceId: dto.serviceId,
        pricePerSession: dto.pricePerSession,
        sessionCount: dto.sessionCount,
        expiryDays: dto.expiryDays,
      },
      business.id,
    );

    this.notify(
      `Admin created a membership package for ${business.businessName}`,
      `An admin created a membership package on a salon's behalf.
• Salon: ${business.businessName}
• Sessions: ${created.sessionCount} at $${Number(created.pricePerSession).toFixed(2)} each
• By: ${createdBy ?? 'an admin'}`,
    );
    return created;
  }

  async deactivate(id: string, actedBy?: string) {
    const pkg = await this.packageRepo.findOne({ where: { id }, relations: ['business'] });
    if (!pkg) throw new NotFoundException('Membership package not found.');
    if (!pkg.isActive) return pkg;

    const saved = await this.merchantMemberships.deactivate(id, pkg.businessId);
    this.notify(
      `Admin deactivated a membership package for ${pkg.business?.businessName ?? 'a salon'}`,
      `An admin switched off a salon's membership package. Clients who already bought it keep their sessions.
• Package: ${id}
• By: ${actedBy ?? 'an admin'}`,
    );
    return saved;
  }

  private notify(trigger: string, body: string) {
    try {
      SlackService.notify({
        node: SlackNode.FINANCE,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.INFO,
        type: SlackEventType.ADMIN_ACTION,
        trigger,
        body,
      });
    } catch {
      // A failed notification must never fail the action itself.
    }
  }
}
