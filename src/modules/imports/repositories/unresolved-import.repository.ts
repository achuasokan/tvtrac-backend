import { injectable } from "inversify";
import { Types } from "mongoose";
import { IUnresolvedImportRepository } from "./unresolved-import.repository.interface.js";
import { IUnresolvedImportItem, UnresolvedImportModel } from "../models/unresolved-import.schema.js";

@injectable()
export class UnresolvedImportRepository implements IUnresolvedImportRepository {
  public async saveBatch(items: Partial<IUnresolvedImportItem>[]): Promise<void> {
    if (!items || items.length === 0) return;
    await UnresolvedImportModel.insertMany(items);
  }

  public async getByJob(userId: string, jobId: string): Promise<IUnresolvedImportItem[]> {
    return await UnresolvedImportModel.find({
      userId: new Types.ObjectId(userId),
      jobId,
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  public async getById(
    userId: string,
    jobId: string,
    unresolvedId: string
  ): Promise<IUnresolvedImportItem | null> {
    if (!Types.ObjectId.isValid(unresolvedId)) return null;

    return await UnresolvedImportModel.findOne({
      _id: new Types.ObjectId(unresolvedId),
      userId: new Types.ObjectId(userId),
      jobId,
    }).exec();
  }

  public async markResolved(
    userId: string,
    jobId: string,
    unresolvedId: string,
    resolvedTmdbId: string,
    resolvedMediaType: 'movie' | 'tv'
  ): Promise<IUnresolvedImportItem | null> {
    if (!Types.ObjectId.isValid(unresolvedId)) return null;

    return await UnresolvedImportModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(unresolvedId),
        userId: new Types.ObjectId(userId),
        jobId,
      },
      {
        $set: {
          status: 'resolved',
          resolvedTmdbId,
          resolvedMediaType,
        },
      },
      { returnDocument: 'after' }
    ).exec();
  }
}
