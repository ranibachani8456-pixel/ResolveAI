import {
  TicketServiceError,
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
} from "../services/ticketService.js";

function handleTicketError(error, response) {
  if (error instanceof TicketServiceError) {
    return response.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Unexpected ticket request error", error);
  return response.status(500).json({
    success: false,
    message: "Unable to complete ticket request",
  });
}

export async function getTickets(request, response) {
  try {
    const tickets = await listTickets(request.user.organizationId, request.query);
    return response.status(200).json({ success: true, data: { tickets } });
  } catch (error) {
    return handleTicketError(error, response);
  }
}

export async function getTicketById(request, response) {
  try {
    const ticket = await getTicket(request.user.organizationId, request.params.ticketId);
    return response.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    return handleTicketError(error, response);
  }
}

export async function createNewTicket(request, response) {
  try {
    const ticket = await createTicket(request.user.organizationId, request.body);
    return response.status(201).json({
      success: true,
      message: "Ticket created successfully",
      data: { ticket },
    });
  } catch (error) {
    return handleTicketError(error, response);
  }
}

export async function updateExistingTicket(request, response) {
  try {
    const ticket = await updateTicket(
      request.user.organizationId,
      request.params.ticketId,
      request.body,
    );
    return response.status(200).json({
      success: true,
      message: "Ticket updated successfully",
      data: { ticket },
    });
  } catch (error) {
    return handleTicketError(error, response);
  }
}
