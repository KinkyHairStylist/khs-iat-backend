import { Business } from 'src/business/entities/business.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('google_credentials')
export class GoogleCredentials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text' })
  refreshToken: string;

  @Column({ type: 'text', nullable: true })
  calendarId: string; // Primary calendar ID

  @Column({ type: 'bigint' })
  expiryDate: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

// // ============================================
// // 5. UPDATE APPOINTMENT ENTITY
// // ============================================
// // Add this column to your Appointment entity:
// /*
// @Column({ type: 'varchar', nullable: true })
// googleEventId?: string;
// */

// // ============================================
// // 6. UPDATE APPOINTMENT SERVICE
// // ============================================
// // In your appointment service, after creating an appointment:
// /*
// import { GoogleCalendarService } from './google-calendar.service';

// @Injectable()
// export class AppointmentService {
//   constructor(
//     @InjectRepository(Appointment)
//     private appointmentRepo: Repository<Appointment>,
//     private googleCalendarService: GoogleCalendarService,
//   ) {}

//   async create(createAppointmentDto: CreateAppointmentDto) {
//     const appointment = this.appointmentRepo.create(createAppointmentDto);
//     await this.appointmentRepo.save(appointment);

//     // Sync to Google Calendar
//     try {
//       const eventId = await this.googleCalendarService.createCalendarEvent(appointment.id);
//       appointment.googleEventId = eventId;
//       await this.appointmentRepo.save(appointment);
//     } catch (error) {
//       console.error('Failed to sync to Google Calendar:', error);
//       // Don't fail the appointment creation if calendar sync fails
//     }

//     return appointment;
//   }

//   async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
//     const appointment = await this.appointmentRepo.findOne({ where: { id } });

//     Object.assign(appointment, updateAppointmentDto);
//     await this.appointmentRepo.save(appointment);

//     // Update Google Calendar event
//     if (appointment.googleEventId) {
//       try {
//         await this.googleCalendarService.updateCalendarEvent(id, appointment.googleEventId);
//       } catch (error) {
//         console.error('Failed to update Google Calendar:', error);
//       }
//     }

//     return appointment;
//   }

//   async delete(id: string) {
//     const appointment = await this.appointmentRepo.findOne({ where: { id } });

//     // Delete from Google Calendar
//     if (appointment.googleEventId) {
//       try {
//         await this.googleCalendarService.deleteCalendarEvent(
//           appointment.business.id,
//           appointment.googleEventId
//         );
//       } catch (error) {
//         console.error('Failed to delete from Google Calendar:', error);
//       }
//     }

//     return this.appointmentRepo.delete(id);
//   }
// }
// */
