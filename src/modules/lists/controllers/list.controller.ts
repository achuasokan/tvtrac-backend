import { inject, injectable } from "inversify";
import { Request, Response } from "express";
import { TYPES } from "../../../di/types.js";
import { IListService } from "../services/list.service.interface.js";
import { CreateListDTO, AddListItemDTO, RemoveListItemDTO, UpdateListDTO, ReorderListDTO } from "../dtos/list.dto.js";
import { sendResponse } from "../../../shared/utils/responseHelper.js";
import { HTTP_STATUS } from "../../../shared/constants/http-status.js";
import { LIST_MESSAGES } from "../constants/list.messages.js";

@injectable()
export class ListController {
    constructor(@inject(TYPES.ListService) private listService: IListService) {}

    public createList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const dto: CreateListDTO = req.body;
            
            if (!dto.name) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, LIST_MESSAGES.ERROR_NAME_REQUIRED);
            }

            const list = await this.listService.createList(userId, dto);
            return sendResponse(res, HTTP_STATUS.CREATED, LIST_MESSAGES.LIST_CREATED, list);
        } catch (error: any) {
            console.error("Create List Error:", error);
            if (error.code === 11000) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, LIST_MESSAGES.ERROR_ALREADY_EXISTS);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, LIST_MESSAGES.ERROR_CREATE_FAILED);
        }
    };

    public updateList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const listId = req.params.id as string;
            const dto: UpdateListDTO = req.body;

            const list = await this.listService.updateList(userId, listId, dto);
            return sendResponse(res, HTTP_STATUS.OK, "List updated successfully", list);
        } catch (error: any) {
            console.error("Update List Error:", error);
            if (error.message.includes("not found") || error.message.includes("permission")) {
                return sendResponse(res, HTTP_STATUS.NOT_FOUND, error.message);
            }
            if (error.code === 11000) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, LIST_MESSAGES.ERROR_ALREADY_EXISTS);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to update list");
        }
    };

    public reorderList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const listId = req.params.id as string;
            const dto: ReorderListDTO = req.body;

            if (!dto.items || !Array.isArray(dto.items)) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, "Items array is required");
            }

            const list = await this.listService.reorderListItems(userId, listId, dto.items);
            return sendResponse(res, HTTP_STATUS.OK, "List reordered successfully", list);
        } catch (error: any) {
            console.error("Reorder List Error:", error);
            if (error.message.includes("not found")) {
                return sendResponse(res, HTTP_STATUS.NOT_FOUND, error.message);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to reorder list");
        }
    };

    public getUserLists = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const lists = await this.listService.getUserLists(userId);
            return sendResponse(res, HTTP_STATUS.OK, LIST_MESSAGES.LISTS_FETCHED, lists);
        } catch (error: any) {
            console.error("Get User Lists Error:", error);
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, LIST_MESSAGES.ERROR_FETCH_FAILED);
        }
    };

    public addToList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const listId = req.params.id as string;
            const dto: AddListItemDTO = req.body;

            if (!dto.tmdbId || !dto.mediaType) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, LIST_MESSAGES.ERROR_MISSING_ITEM_DATA);
            }

            const list = await this.listService.addToList(userId, listId, dto.tmdbId, dto.mediaType);
            return sendResponse(res, HTTP_STATUS.OK, LIST_MESSAGES.ITEM_ADDED, list);
        } catch (error: any) {
            console.error("Add to List Error:", error);
            if (error.message === "List not found") {
                return sendResponse(res, HTTP_STATUS.NOT_FOUND, LIST_MESSAGES.ERROR_NOT_FOUND);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, LIST_MESSAGES.ERROR_ADD_FAILED);
        }
    };

    public removeFromList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const listId = req.params.id as string;
            const dto: RemoveListItemDTO = req.body;

            if (!dto.tmdbId || !dto.mediaType) {
                return sendResponse(res, HTTP_STATUS.BAD_REQUEST, LIST_MESSAGES.ERROR_MISSING_ITEM_DATA);
            }

            const list = await this.listService.removeFromList(userId, listId, dto.tmdbId, dto.mediaType);
            return sendResponse(res, HTTP_STATUS.OK, LIST_MESSAGES.ITEM_REMOVED, list);
        } catch (error: any) {
            console.error("Remove from List Error:", error);
            if (error.message === "List not found") {
                return sendResponse(res, HTTP_STATUS.NOT_FOUND, LIST_MESSAGES.ERROR_NOT_FOUND);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, LIST_MESSAGES.ERROR_REMOVE_FAILED);
        }
    };

    public deleteList = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.userId as string;
            const listId = req.params.id as string;

            await this.listService.deleteList(userId, listId);
            return sendResponse(res, HTTP_STATUS.OK, LIST_MESSAGES.LIST_DELETED);
        } catch (error: any) {
            console.error("Delete List Error:", error);
            if (error.message.includes("not found")) {
                return sendResponse(res, HTTP_STATUS.NOT_FOUND, error.message);
            }
            return sendResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, LIST_MESSAGES.ERROR_DELETE_FAILED);
        }
    };
}
